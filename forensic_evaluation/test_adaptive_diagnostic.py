import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
from PIL import Image, ImageChops
import cv2
import io
import os
from forgery_service.ela_engine import extract_image_from_bytes

def estimate_jpeg_quality(pil_img):
    if hasattr(pil_img, 'quantization') and pil_img.quantization:
        t0 = pil_img.quantization.get(0, None)
        if t0 is not None and len(t0) > 0:
            val = t0[0]
            if val <= 1:
                return 99
            elif val <= 2:
                return 95
            elif val <= 3:
                return 90
            elif val <= 5:
                return 85
            elif val <= 7:
                return 80
            elif val <= 10:
                return 75
            else:
                return 70
    return None

def evaluate_adaptive_ela(file_bytes, filename):
    img = extract_image_from_bytes(file_bytes, filename)
    w, h = img.size

    # Check native JPEG quality
    est_q = None
    if filename.lower().endswith(('.jpg', '.jpeg')):
        try:
            with Image.open(io.BytesIO(file_bytes)) as raw_im:
                est_q = estimate_jpeg_quality(raw_im)
        except:
            pass

    is_pdf = filename.lower().endswith('.pdf')

    # 1. ELA computation at probe quality 90
    probe_q = 90
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=probe_q)
    buf.seek(0)
    resaved = Image.open(buf).convert('RGB')
    diff = ImageChops.difference(img, resaved)
    diff_np = np.array(diff, dtype=np.float32)
    mag = np.sqrt(np.sum(diff_np**2, axis=2))

    # 2. Text / edge density via Sobel on grayscale
    gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    sobelx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    edge_mag = np.sqrt(sobelx**2 + sobely**2)

    # 3. Spatial 8x8 grid decomposition
    H, W = mag.shape
    th, tw = H // 8, W // 8
    tile_ela_means = []
    tile_edge_means = []
    tile_coords = []

    for r in range(8):
        for c in range(8):
            t_ela = mag[r*th:(r+1)*th, c*tw:(c+1)*tw]
            t_edge = edge_mag[r*th:(r+1)*th, c*tw:(c+1)*tw]
            tile_ela_means.append(float(np.mean(t_ela)))
            tile_edge_means.append(float(np.mean(t_edge)))
            tile_coords.append((r, c, [int(r*th), int(c*tw), int((r+1)*th), int((c+1)*tw)]))

    tile_ela = np.array(tile_ela_means, dtype=np.float32)
    tile_edge = np.array(tile_edge_means, dtype=np.float32)

    # 4. Correlation between edge density and ELA error
    std_edge = float(np.std(tile_edge))
    std_ela = float(np.std(tile_ela))
    corr = float(np.corrcoef(tile_ela, tile_edge)[0, 1]) if (std_edge > 1e-4 and std_ela > 1e-4) else 0.0
    if np.isnan(corr): corr = 0.0

    # 5. Fit expected ELA from edge density
    if std_edge > 1e-3:
        p = np.polyfit(tile_edge, tile_ela, 1)
        expected_ela = p[0] * tile_edge + p[1]
        residuals = tile_ela - expected_ela
        std_res = float(np.std(residuals))
        med_res = float(np.median(residuals))
        z_res = (residuals - med_res) / (std_res + 1e-5) if std_res > 0 else np.zeros_like(residuals)
    else:
        residuals = tile_ela - np.median(tile_ela)
        std_res = float(np.std(residuals))
        z_res = residuals / (std_res + 1e-5) if std_res > 0 else np.zeros_like(residuals)

    peak_z_res = float(np.max(z_res))

    # Flagged tiles: tiles where residual error significantly exceeds edge expectation
    suspicious_tiles = []
    for idx, (r, c, bbox) in enumerate(tile_coords):
        if z_res[idx] >= 3.0 and residuals[idx] > 3.0:
            suspicious_tiles.append({
                'grid_row': r,
                'grid_col': c,
                'bbox': bbox,
                'tile_mean': round(float(tile_ela[idx]), 2),
                'edge_mean': round(float(tile_edge[idx]), 2),
                'residual': round(float(residuals[idx]), 2),
                'z_score': round(float(z_res[idx]), 2),
            })

    # Decision logic
    # Rule 1: Very low global ELA magnitude and uniform error floor -> Clean baseline
    if std_ela < 2.0 and float(np.max(tile_ela)) < 15.0:
        assessment = 'NO_SIGNIFICANT_ANOMALIES'
        diagnostic = 'Uniform low-error compression baseline across all document tiles.'
    # Rule 2: High contrast vector typography (e.g. uncompressed PDF render) where ELA variance is strongly
    # correlated with natural text edges (corr > 0.80) and edge-compensated residuals are bounded
    elif corr >= 0.80 and peak_z_res < 3.0:
        assessment = 'NO_SIGNIFICANT_ANOMALIES'
        diagnostic = 'Compression variance is consistently explained by typography edge gradient density.'
    # Rule 3: High localized tile discrepancy or decoupled edge-compression relationship
    else:
        assessment = 'ANOMALIES_DETECTED'
        diagnostic = 'Localized compression discrepancies detected independent of typography gradient.'

    return {
        'assessment': assessment,
        'diagnostic': diagnostic,
        'corr': round(corr, 3),
        'peak_z_res': round(peak_z_res, 2),
        'est_q': est_q if est_q else ('PDF' if is_pdf else 'UNKNOWN'),
        'tiles_flagged': len(suspicious_tiles),
        'flagged': suspicious_tiles,
    }

samples = [
    ('Clean PDF Aarav (41.7% Sample)', 'certificates_pdf/1_Authentic_Degree_Aarav_Sharma.pdf'),
    ('Clean JPG Aarav Q95', 'forensic_evaluation/held_out_samples/held_out_01_clean_aarav_q95.jpg'),
    ('Clean JPG Ananya Q90', 'forensic_evaluation/held_out_samples/held_out_02_clean_ananya_q90.jpg'),
    ('Clean JPG Rohan Q85', 'forensic_evaluation/held_out_samples/held_out_03_clean_rohan_q85.jpg'),
    ('Clean Scanned Noise', 'forensic_evaluation/held_out_samples/held_out_04_clean_scanned_noise.jpg'),
    ('Clean Web Q75', 'forensic_evaluation/held_out_samples/held_out_05_clean_web_recompressed_q75.jpg'),
    ('Baseline Q95', 'forensic_evaluation/samples/sample_01_baseline_q95.jpg'),
    ('Baseline Q90', 'forensic_evaluation/samples/sample_02_baseline_q90.jpg'),
    ('Baseline Q80', 'forensic_evaluation/samples/sample_03_baseline_q80.jpg'),
    ('Tampered Splice Q75/Q98', 'forensic_evaluation/samples/sample_04_splice_cgpa_q75_q98.jpg'),
    ('Tampered Splice Raw/Q70', 'forensic_evaluation/samples/sample_05_splice_name_cgpa_q70_uncompressed.jpg'),
    ('Tampered Double Comp', 'forensic_evaluation/samples/sample_06_splice_double_compression_q80_q60.jpg'),
    ('Tampered Name Splice', 'forensic_evaluation/held_out_samples/held_out_06_tampered_name_splice_q90.jpg'),
    ('Tampered CGPA 9.95', 'forensic_evaluation/held_out_samples/held_out_07_tampered_cgpa_995_q85.jpg'),
    ('Tampered PRN Forgery', 'forensic_evaluation/held_out_samples/held_out_08_tampered_prn_forgery.jpg'),
]

for label, p in samples:
    if os.path.exists(p):
        with open(p, 'rb') as f:
            b = f.read()
        res = evaluate_adaptive_ela(b, p)
        print(f"{label:<32} | {res['assessment']:<24} | Corr: {res['corr']:>5} | PeakZ: {res['peak_z_res']:>5} | Tiles: {res['tiles_flagged']} | Q: {res['est_q']}")
