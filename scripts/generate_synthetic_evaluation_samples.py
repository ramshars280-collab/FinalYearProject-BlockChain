"""
Generates 6 controlled synthetic certificate image samples for isolated ELA forensic evaluation:
- 3 Clean Baseline samples (single-pass JPEG compression at Q=95, Q=90, Q=80)
- 3 Spliced Samples (controlled localized compression mismatches in CGPA and Name regions)

All generated files are stored exclusively in forensic_evaluation/samples/.
Original certificate PDFs in certificates_pdf/ are strictly untouched.
"""

import os
import io
import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_DIR = os.path.join(BASE_DIR, "certificates_pdf", "reference_design")
OUT_DIR = os.path.join(BASE_DIR, "forensic_evaluation", "samples")

os.makedirs(OUT_DIR, exist_ok=True)

def render_pdf_to_pil(pdf_filename: str) -> Image.Image:
    pdf_path = os.path.join(PDF_DIR, pdf_filename)
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"Source PDF not found: {pdf_path}")
    doc = pdfium.PdfDocument(pdf_path)
    return doc[0].render(scale=2.0).to_pil().convert("RGB")

def compress_jpeg(image: Image.Image, quality: int) -> Image.Image:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB")

def get_fallback_font(size: int):
    # Try system fonts, fallback to default
    candidates = [
        "C:\\Windows\\Fonts\\arialbd.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\segoeui.ttf",
    ]
    for font_path in candidates:
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                continue
    return ImageFont.load_default()

def main():
    print("=== Generating Controlled Synthetic Forensic Evaluation Samples ===")
    
    # -------------------------------------------------------------
    # 1. SAMPLE 01: Clean Baseline (Quality 95)
    # -------------------------------------------------------------
    base1 = render_pdf_to_pil("SOET-SEPOLIA-2026-TEST01_DEMO-CSE-2026-001.pdf")
    s1_path = os.path.join(OUT_DIR, "sample_01_baseline_q95.jpg")
    base1.save(s1_path, format="JPEG", quality=95)
    print(f"[CREATED] Sample 01 (Clean Baseline Q=95): {s1_path}")

    # -------------------------------------------------------------
    # 2. SAMPLE 02: Clean Baseline (Quality 90)
    # -------------------------------------------------------------
    base2 = render_pdf_to_pil("SOET-SEPOLIA-2026-TEST01_DEMO-CSE-2026-002.pdf")
    s2_path = os.path.join(OUT_DIR, "sample_02_baseline_q90.jpg")
    base2.save(s2_path, format="JPEG", quality=90)
    print(f"[CREATED] Sample 02 (Clean Baseline Q=90): {s2_path}")

    # -------------------------------------------------------------
    # 3. SAMPLE 03: Clean Baseline (Quality 80)
    # -------------------------------------------------------------
    base3 = render_pdf_to_pil("SOET-SEPOLIA-2026-TEST01_DEMO-CSE-2026-003.pdf")
    s3_path = os.path.join(OUT_DIR, "sample_03_baseline_q80.jpg")
    base3.save(s3_path, format="JPEG", quality=80)
    print(f"[CREATED] Sample 03 (Clean Baseline Q=80): {s3_path}")

    # -------------------------------------------------------------
    # 4. SAMPLE 04: Spliced CGPA (Base Q=75, Spliced Patch Q=98, Final Q=85)
    # -------------------------------------------------------------
    # Base compressed at low quality Q=75
    base_q75 = compress_jpeg(base1, quality=75)
    
    # Create high-quality spliced patch over CGPA region (y: 565-615, x: 600-1150)
    # Background color is parchment cream (#faf8f0 / RGB: 250, 248, 240)
    bg_color = (250, 248, 240)
    font_bold = get_fallback_font(28)
    
    patch_w = 540
    patch_h = 50
    patch = Image.new("RGB", (patch_w, patch_h), bg_color)
    draw_patch = ImageDraw.Draw(patch)
    draw_patch.text((10, 8), "Cumulative CGPA of 9.95", fill=(36, 35, 33), font=font_bold)
    
    # Compress patch at Q=98
    patch_q98 = compress_jpeg(patch, quality=98)
    
    # Paste onto base at CGPA coordinates (approx center-aligned)
    composite4 = base_q75.copy()
    paste_x = 650
    paste_y = 572
    composite4.paste(patch_q98, (paste_x, paste_y))
    
    s4_path = os.path.join(OUT_DIR, "sample_04_splice_cgpa_q75_q98.jpg")
    composite4.save(s4_path, format="JPEG", quality=85)
    print(f"[CREATED] Sample 04 (Spliced CGPA Q=75/98 -> 85): {s4_path}")

    # -------------------------------------------------------------
    # 5. SAMPLE 05: Spliced Name & CGPA (Base Q=70, Uncompressed Patches, Final Q=90)
    # -------------------------------------------------------------
    base_q70 = compress_jpeg(base2, quality=70)
    
    # Name patch: replace student name at (x: 500-1180, y: 365-435)
    font_name = get_fallback_font(36)
    name_patch = Image.new("RGB", (680, 65), bg_color)
    draw_name = ImageDraw.Draw(name_patch)
    draw_name.text((20, 8), "SYNTHETIC CANDIDATE ALPHA", fill=(34, 33, 31), font=font_name)
    
    # CGPA patch
    cgpa_patch2 = Image.new("RGB", (540, 50), bg_color)
    draw_cgpa2 = ImageDraw.Draw(cgpa_patch2)
    draw_cgpa2.text((10, 8), "Cumulative CGPA of 9.98", fill=(36, 35, 33), font=font_bold)
    
    composite5 = base_q70.copy()
    composite5.paste(name_patch, (500, 370))
    composite5.paste(cgpa_patch2, (650, 572))
    
    s5_path = os.path.join(OUT_DIR, "sample_05_splice_name_cgpa_q70_uncompressed.jpg")
    composite5.save(s5_path, format="JPEG", quality=90)
    print(f"[CREATED] Sample 05 (Spliced Name & CGPA Q=70/Raw -> 90): {s5_path}")

    # -------------------------------------------------------------
    # 6. SAMPLE 06: Spliced Double-Compression (Base Q=80, Double-Compressed Patch, Final Q=80)
    # -------------------------------------------------------------
    base_q80 = compress_jpeg(base3, quality=80)
    
    # Create patch, compress at Q=60, recompress at Q=95
    patch3 = Image.new("RGB", (540, 50), bg_color)
    draw_patch3 = ImageDraw.Draw(patch3)
    draw_patch3.text((10, 8), "Cumulative CGPA of 9.90", fill=(36, 35, 33), font=font_bold)
    patch_double = compress_jpeg(compress_jpeg(patch3, quality=60), quality=95)
    
    composite6 = base_q80.copy()
    composite6.paste(patch_double, (650, 572))
    
    s6_path = os.path.join(OUT_DIR, "sample_06_splice_double_compression_q80_q60.jpg")
    composite6.save(s6_path, format="JPEG", quality=80)
    print(f"[CREATED] Sample 06 (Double-Compressed Spliced CGPA): {s6_path}")

    print("\n--- All 6 samples generated successfully in forensic_evaluation/samples/ ---")

if __name__ == "__main__":
    main()

