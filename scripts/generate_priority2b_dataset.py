"""
Expands the synthetic evaluation dataset for Priority 2B testing.
Adds:
- sample_14_photo_replacement.jpg: University seal/photo replaced with mismatched compression portrait/seal
- sample_15_regenerated_fraudulent_single_pass.jpg: Complete single-pass regenerated fraudulent certificate (fake CGPA 9.99, single Q90 save, no splicing seams)
- sample_16_recompressed_clean_q85.jpg: Clean authentic certificate recompressed at Q85 (no tampering)
- sample_17_pasted_grade_patch.jpg: Pasted grade box with subtle boundary misalignment
- sample_18_clean_student002_q95.jpg: Clean authentic certificate for student 002 at Q95
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
    print("Generating Priority 2B extended evaluation samples...")
    base1 = Image.open(os.path.join(SAMPLES_DIR, "sample_01_baseline_q95.jpg")).convert("RGB")
    base2 = Image.open(os.path.join(SAMPLES_DIR, "sample_02_baseline_q90.jpg")).convert("RGB")
    bg_color = (250, 248, 240)
    font_bold = get_font(26)
    font_title = get_font(34)

    # 1. sample_14: Photo / Seal replacement (Photo ID box spliced into left margin)
    photo_box = Image.new("RGB", (140, 170), (220, 230, 245))
    d_photo = ImageDraw.Draw(photo_box)
    d_photo.rectangle((5, 5, 135, 165), outline=(30, 50, 100), width=3)
    # Draw simple avatar shape
    d_photo.ellipse((45, 30, 95, 80), fill=(100, 120, 160))
    d_photo.polygon([(20, 150), (120, 150), (100, 95), (40, 95)], fill=(80, 100, 140))
    d_photo.text((32, 152), "CANDIDATE", fill=(30, 50, 100), font=get_font(12))
    photo_q98 = compress_jpeg(photo_box, quality=98)
    
    comp14 = compress_jpeg(base1, quality=75)
    comp14.paste(photo_q98, (120, 360))
    s14_path = os.path.join(SAMPLES_DIR, "sample_14_photo_replacement.jpg")
    comp14.save(s14_path, format="JPEG", quality=85)
    print(f"[CREATED] {s14_path}")

    # 2. sample_15: Single-pass regenerated fraudulent certificate
    # Clean single-pass export from scratch with fraudulent CGPA 9.99 and fake student name
    # Physical ELA has IDENTICAL compression history across entire image!
    regen = base1.copy()
    d_regen = ImageDraw.Draw(regen)
    # Redraw name and CGPA using matching cream background
    d_regen.rectangle((450, 360, 1250, 440), fill=bg_color)
    d_regen.text((510, 375), "FRAUDULENT CANDIDATE OMEGA", fill=(36, 35, 33), font=font_title)
    d_regen.rectangle((600, 560, 1200, 630), fill=bg_color)
    d_regen.text((640, 575), "Cumulative CGPA of 9.99", fill=(36, 35, 33), font=font_bold)
    # Save once as JPEG Q=90 in single generation (NO splicing seams!)
    s15_path = os.path.join(SAMPLES_DIR, "sample_15_regenerated_fraudulent_single_pass.jpg")
    regen.save(s15_path, format="JPEG", quality=90)
    print(f"[CREATED] {s15_path}")

    # 3. sample_16: Recompressed clean document (authentic certificate resaved at Q=85)
    s16_path = os.path.join(SAMPLES_DIR, "sample_16_recompressed_clean_q85.jpg")
    base1.save(s16_path, format="JPEG", quality=85)
    print(f"[CREATED] {s16_path}")

    # 4. sample_17: Pasted grade box with subtle boundary misalignment
    base_q80 = compress_jpeg(base1, quality=80)
    patch17 = Image.new("RGB", (320, 45), (248, 245, 235))
    d17 = ImageDraw.Draw(patch17)
    d17.text((10, 8), "GRADE: O (OUTSTANDING)", fill=(36, 35, 33), font=font_bold)
    patch17_q95 = compress_jpeg(patch17, quality=95)
    comp17 = base_q80.copy()
    comp17.paste(patch17_q95, (680, 635))
    s17_path = os.path.join(SAMPLES_DIR, "sample_17_pasted_grade_patch.jpg")
    comp17.save(s17_path, format="JPEG", quality=80)
    print(f"[CREATED] {s17_path}")

    # 5. sample_18: Clean authentic student 002 at Q95
    s18_path = os.path.join(SAMPLES_DIR, "sample_18_clean_student002_q95.jpg")
    base2.save(s18_path, format="JPEG", quality=95)
    print(f"[CREATED] {s18_path}")

    print("Priority 2B extended evaluation dataset generated successfully.")

if __name__ == "__main__":
    main()

