"""
Generates extended synthetic evaluation samples for Priority 2 Phase B testing.
Categories covered:
1. Original unmodified certificates (existing sample_01, 02, 03)
2. Modified student names (existing sample_05)
3. Modified PRN (sample_07_splice_prn_q75_q95.jpg)
4. Altered CGPA (existing sample_04)
5. Replaced logo/seal (sample_08_replaced_logo_q70_q95.jpg)
6. Pasted/double-compressed region (existing sample_06)
7. Recompressed and rescanned legitimate certificate (sample_09_rescanned_recompressed_legitimate.jpg)
8. Different formats:
   - sample_10_clean_baseline.png
   - sample_11_splice_cgpa.png
   - sample_12_clean_baseline.pdf
   - sample_13_splice_cgpa.pdf
"""

import os
import io
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES_DIR = os.path.join(BASE_DIR, "forensic_evaluation", "samples")

os.makedirs(SAMPLES_DIR, exist_ok=True)

def get_font(size: int):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

def compress_jpeg(image: Image.Image, quality: int) -> Image.Image:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB")

def main():
    print("Generating extended synthetic samples for Priority 2 Phase B...")
    base_img = Image.open(os.path.join(SAMPLES_DIR, "sample_01_baseline_q95.jpg")).convert("RGB")
    bg_color = (250, 248, 240)
    font_bold = get_font(26)

    # 3. Modified PRN: sample_07_splice_prn_q75_q95.jpg
    base_q75 = compress_jpeg(base_img, quality=75)
    prn_patch = Image.new("RGB", (480, 45), bg_color)
    d_prn = ImageDraw.Draw(prn_patch)
    d_prn.text((10, 8), "PRN: 2026-CSE-FORGED-99", fill=(36, 35, 33), font=font_bold)
    prn_patch_q98 = compress_jpeg(prn_patch, quality=98)
    comp7 = base_q75.copy()
    comp7.paste(prn_patch_q98, (600, 480))
    s7_path = os.path.join(SAMPLES_DIR, "sample_07_splice_prn_q75_q95.jpg")
    comp7.save(s7_path, format="JPEG", quality=85)
    print(f"[CREATED] {s7_path}")

    # 5. Replaced Logo/Seal: sample_08_replaced_logo_q70_q95.jpg
    logo_patch = Image.new("RGB", (180, 180), bg_color)
    d_logo = ImageDraw.Draw(logo_patch)
    # Draw an altered geometric emblem with high contrast
    d_logo.ellipse((10, 10, 170, 170), outline=(180, 30, 30), width=6)
    d_logo.ellipse((30, 30, 150, 150), outline=(30, 30, 150), width=4)
    d_logo.polygon([(90, 40), (140, 140), (40, 140)], fill=(200, 160, 40), outline=(100, 70, 20))
    d_logo.text((65, 85), "FAKE", fill=(200, 0, 0), font=get_font(20))
    logo_patch_q98 = compress_jpeg(logo_patch, quality=98)
    comp8 = base_q75.copy()
    # Seal location in header
    comp8.paste(logo_patch_q98, (752, 90))
    s8_path = os.path.join(SAMPLES_DIR, "sample_08_replaced_logo_q70_q95.jpg")
    comp8.save(s8_path, format="JPEG", quality=85)
    print(f"[CREATED] {s8_path}")

    # 7. Rescanned & Recompressed Legitimate: sample_09_rescanned_recompressed_legitimate.jpg
    # Legitimate certificate, uniform across whole canvas:
    # 0.7px Gaussian blur + slight contrast boost + single pass JPEG Q82
    rescanned = base_img.filter(ImageFilter.GaussianBlur(radius=0.7))
    rescanned = ImageEnhance.Contrast(rescanned).enhance(1.03)
    s9_path = os.path.join(SAMPLES_DIR, "sample_09_rescanned_recompressed_legitimate.jpg")
    rescanned.save(s9_path, format="JPEG", quality=82)
    print(f"[CREATED] {s9_path}")

    # 8. Different Formats:
    # Clean PNG
    s10_path = os.path.join(SAMPLES_DIR, "sample_10_clean_baseline.png")
    base_img.save(s10_path, format="PNG")
    print(f"[CREATED] {s10_path}")

    # Spliced CGPA PNG (using sample_04 content)
    s4_img = Image.open(os.path.join(SAMPLES_DIR, "sample_04_splice_cgpa_q75_q98.jpg"))
    s11_path = os.path.join(SAMPLES_DIR, "sample_11_splice_cgpa.png")
    s4_img.save(s11_path, format="PNG")
    print(f"[CREATED] {s11_path}")

    # Clean PDF
    s12_path = os.path.join(SAMPLES_DIR, "sample_12_clean_baseline.pdf")
    base_img.save(s12_path, format="PDF", resolution=150.0)
    print(f"[CREATED] {s12_path}")

    # Spliced CGPA PDF
    s13_path = os.path.join(SAMPLES_DIR, "sample_13_splice_cgpa.pdf")
    s4_img.save(s13_path, format="PDF", resolution=150.0)
    print(f"[CREATED] {s13_path}")

    print("All extended synthetic samples generated successfully.")

if __name__ == "__main__":
    main()

