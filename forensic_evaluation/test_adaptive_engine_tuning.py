import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from PIL import Image, ImageChops
import cv2
import io
from forgery_service.ela_engine import extract_image_from_bytes

def estimate_jpeg_quality(pil_img):
    if hasattr(pil_img, 'quantization') and pil_img.quantization:
        t0 = pil_img.quantization.get(0, None)
        if t0 is not None and len(t0) > 0:
            val = t0[0]
            if val <= 1: return 99
            elif val <= 2: return 95
            elif val <= 3: return 90
            elif val <= 5: return 85
            elif val <= 7: return 80
            elif val <= 10: return 75
            else: return 70
    return None

def run_adaptive_forensic_pipeline(file_bytes, filename):
    img = extract_image_from_bytes(file_bytes, filename)
    width, height = img.size
    is_pdf = filename.lower().endswith('.pdf')

    # 1. Native format / quality analysis
    est_q = None
    if filename.lower().endswith(('.jpg', '.jpeg')):
        try:
            with Image.open(io.BytesIO(file_bytes)) as raw_im:
                est_q = estimate_jpeg_quality(raw_im)
        except:
            pass

    format_label = "PDF_VECTOR_RENDER" if is_pdf else (f"JPEG_Q{est_q}" if est_q else "RASTER_IMAGE")

    # 2. Standard ELA residual computation at probe quality 90
    probe_q = 90
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=probe_q)
    buf.seek(0)
    resaved = Image.open(buf).convert("RGB")
    diff = ImageChops.difference(img, resaved)
    diff_np = np.array(diff, dtype=np.float32)
    mag = np.sqrt(np.sum(diff_np**2, axis=2))

    std_dev = float(np.std(mag))
    mean_ela = float(np.mean(mag))
    max_val = float(np.max(mag))

    # 3. Typography Edge Density via Sobel Gradient
    gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    sobelx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    edge_mag = np.sqrt(sobelx**2 + sobely**2)

    # 4. Spatial 8x8 Decomposition
    grid_size = 8
    H, W = mag.shape
    th, tw = max(1, H // grid_size), max(1, W // grid_size)

    tile_ela_means = []
    tile_edge_means = []
    tile_coords = []

    for r in range(grid_size):
        for c in range(grid_size):
            t_ela = mag[r*th:(r+1)*th, c*tw:(c+1)*tw]
            t_edge = edge_mag[r*th:(r+1)*th, c*tw:(c+1)*tw]
            tile_ela_means.append(float(np.mean(t_ela)))
            tile_edge_means.append(float(np.mean(t_edge)))
            tile_coords.append((r, c, [int(r*th), int(c*tw), int((r+1)*th), int((c+1)*tw)]))

    tile_ela = np.array(tile_ela_means, dtype=np.float32)
    tile_edge = np.array(tile_edge_means, dtype=np.float32)

    # 5. Edge-ELA Correlation Analysis
    std_edge = float(np.std(tile_edge))
    std_ela_tiles = float(np.std(tile_ela))
    corr = float(np.corrcoef(tile_ela, tile_edge)[0, 1]) if (std_edge > 1e-4 and std_ela_tiles > 1e-4) else 0.0
    if np.isnan(corr): corr = 0.0

    # 6. Content-Adaptive Residual Modeling
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

    peak_z_res = float(np.max(z_res)) if len(z_res) > 0 else 0.0

    # 7. Identify Genuine Localized Compression Outliers
    # Physical Significance Floor: An error difference < 2.0 intensity levels (out of 255)
    # is microscopic quantization roundoff, not a localized physical splice.
    suspicious_tiles = []
    for idx, (r, c, bbox) in enumerate(tile_coords):
        res_diff = float(residuals[idx] - med_res)
        # A tile is flagged as localized anomaly only if:
        # 1. Z-score is statistically significant (>= 3.25)
        # 2. Absolute residual difference is physically significant (>= 2.5 intensity levels)
        if z_res[idx] >= 3.25 and res_diff >= 2.5:
            suspicious_tiles.append({
                "grid_row": r,
                "grid_col": c,
                "bbox": bbox,
                "tile_mean": round(float(tile_ela[idx]), 2),
                "edge_mean": round(float(tile_edge[idx]), 2),
                "residual": round(float(residuals[idx]), 2),
                "z_score": round(float(z_res[idx]), 2),
            })

    suspicious_tiles.sort(key=lambda x: x["z_score"], reverse=True)

    # 8. Adaptive Calibrated Anomaly Score
    # For genuine vector PDF: high correlation (corr > 0.85) proves high std_dev is typographic anti-aliasing.
    # Therefore, weight unexplained residuals rather than raw global std_dev!
    if is_pdf or format_label == "PDF_VECTOR_RENDER":
        # Typographic edge compensation
        unexplained_variance = float(std_res / 5.0)
        peak_anomaly = float(max(0.0, (peak_z_res - 2.5) / 4.0))
        corr_discount = max(0.0, min(1.0, (corr - 0.70) / 0.25))
        calibrated_score = 0.35 * unexplained_variance + 0.35 * peak_anomaly + 0.30 * (1.0 - corr_discount)
    else:
        # Standard raster image / JPEG
        norm_std = min(1.0, std_dev / 4.5)
        peak_anomaly = float(max(0.0, (peak_z_res - 2.5) / 4.0))
        suspicious_tile_penalty = min(1.0, len(suspicious_tiles) * 0.20)
        calibrated_score = 0.30 * norm_std + 0.40 * peak_anomaly + 0.30 * suspicious_tile_penalty

    calibrated_score = float(max(0.05, min(0.95, calibrated_score)))
    score_rounded = round(calibrated_score, 4)

    # 9. Three-Tier Decision Architecture (P10-T05E Enhanced)
    # Tier 1: NO_SIGNIFICANT_ANOMALIES
    # Tier 2: ANOMALIES_DETECTED (Uncertain compression variance)
    # Tier 3: ANOMALIES_DETECTED (Strong localized manipulation evidence)
    if len(suspicious_tiles) == 0 and score_rounded < 0.35:
        assessment = "NO_SIGNIFICANT_ANOMALIES"
        verdict = "NO_SIGNIFICANT_ANOMALIES"
        review_tier = "NO_SIGNIFICANT_ANOMALIES"
        advisory = "Compression residuals are consistent across document tiles. No significant localized compression discrepancies detected."
        diagnostic = "Uniform compression history across document elements. Typography gradient density fully accounts for spatial residual variations."
    elif len(suspicious_tiles) >= 3 or (len(suspicious_tiles) >= 1 and peak_z_res >= 4.5):
        assessment = "ANOMALIES_DETECTED"
        verdict = "ANOMALIES_DETECTED"
        review_tier = "STRONG_MANIPULATION_EVIDENCE"
        advisory = "Strong localized compression discrepancies detected. Document integrity requires investigation."
        diagnostic = f"Multiple localized tiles ({len(suspicious_tiles)} anomalous region(s), Peak Z={peak_z_res:.2f}) exhibit sharp compression residual discrepancies that contradict surrounding typography and canvas background."
    else:
        assessment = "ANOMALIES_DETECTED"
        verdict = "ANOMALIES_DETECTED"
        review_tier = "UNCERTAIN_COMPRESSION_VARIANCE"
        advisory = "Unusual compression patterns detected. Manual document inspection is recommended. These findings alone do not establish forgery."
        diagnostic = f"Minor localized compression variance detected (Peak Z={peak_z_res:.2f}, {len(suspicious_tiles)} tile(s)). May reflect legitimate document recompression, scanning acquisition noise, or high-contrast graphics."

    return {
        "success": True,
        "assessment": assessment,
        "verdict": verdict,
        "review_tier": review_tier,
        "ai_confidence_score": score_rounded,
        "advisory": advisory,
        "diagnostic_reason": diagnostic,
        "metadata": {
            "format_label": format_label,
            "estimated_native_quality": est_q,
            "edge_ela_correlation": round(corr, 3),
            "edge_compensated_peak_zscore": round(peak_z_res, 2),
            "anomaly_std_dev": round(std_dev, 2),
            "localized_tile_peak_zscore": round(peak_z_res, 2),
            "localized_tile_count": 64,
            "localized_suspicious_regions": suspicious_tiles[:5],
            "input_dimensions": [width, height],
        }
    }

if __name__ == "__main__":
    test_samples = [
        ("Clean PDF Aarav (41.7% Sample)", "certificates_pdf/1_Authentic_Degree_Aarav_Sharma.pdf"),
        ("Clean JPG Aarav Q95", "forensic_evaluation/held_out_samples/held_out_01_clean_aarav_q95.jpg"),
        ("Clean JPG Ananya Q90", "forensic_evaluation/held_out_samples/held_out_02_clean_ananya_q90.jpg"),
        ("Clean JPG Rohan Q85", "forensic_evaluation/held_out_samples/held_out_03_clean_rohan_q85.jpg"),
        ("Clean Scanned Noise", "forensic_evaluation/held_out_samples/held_out_04_clean_scanned_noise.jpg"),
        ("Clean Web Q75", "forensic_evaluation/held_out_samples/held_out_05_clean_web_recompressed_q75.jpg"),
        ("Baseline Q95", "forensic_evaluation/samples/sample_01_baseline_q95.jpg"),
        ("Baseline Q90", "forensic_evaluation/samples/sample_02_baseline_q90.jpg"),
        ("Baseline Q80", "forensic_evaluation/samples/sample_03_baseline_q80.jpg"),
        ("Tampered Splice Q75/Q98", "forensic_evaluation/samples/sample_04_splice_cgpa_q75_q98.jpg"),
        ("Tampered Splice Raw/Q70", "forensic_evaluation/samples/sample_05_splice_name_cgpa_q70_uncompressed.jpg"),
        ("Tampered Double Comp", "forensic_evaluation/samples/sample_06_splice_double_compression_q80_q60.jpg"),
        ("Tampered Name Splice", "forensic_evaluation/held_out_samples/held_out_06_tampered_name_splice_q90.jpg"),
        ("Tampered CGPA 9.95", "forensic_evaluation/held_out_samples/held_out_07_tampered_cgpa_995_q85.jpg"),
        ("Tampered PRN Forgery", "forensic_evaluation/held_out_samples/held_out_08_tampered_prn_forgery.jpg"),
    ]

    print(f"{'Sample Description':<32} | {'Score':<6} | {'Assessment':<24} | {'Review Tier':<30} | {'Tiles':<5} | {'Peak Z':<6} | {'Corr':<5}")
    print("-" * 120)
    for desc, path in test_samples:
        if os.path.exists(path):
            with open(path, "rb") as f:
                b = f.read()
            res = run_adaptive_forensic_pipeline(b, path)
            print(f"{desc:<32} | {res['ai_confidence_score']:<6.4f} | {res['assessment']:<24} | {res['review_tier']:<30} | {len(res['metadata']['localized_suspicious_regions']):<5} | {res['metadata']['edge_compensated_peak_zscore']:<6.2f} | {res['metadata']['edge_ela_correlation']:<5.3f}")
