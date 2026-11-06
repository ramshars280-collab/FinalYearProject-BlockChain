"""
Generates the Independent Held-Out Validation Dataset for Priority 2C.
This dataset is strictly held out and was NOT used to tune detection thresholds.

Samples:
- held_out_01_clean_aarav_q95.jpg: Clean authentic certificate for Aarav Sharma (Q95)
- held_out_02_clean_ananya_q90.jpg: Clean authentic certificate for Ananya Malhotra (Q90)
- held_out_03_clean_rohan_q85.jpg: Clean authentic certificate for Rohan Kulkarni (Q85)
- held_out_04_clean_scanned_noise.jpg: Clean authentic certificate with realistic scanner sensor noise and slight gamma shift
- held_out_05_clean_web_recompressed_q75.jpg: Clean authentic certificate recompressed at Q75 for web viewing
- held_out_06_tampered_name_splice_q90.jpg: Altered candidate name ('VIKRAM ADITYA') spliced into authentic Aarav certificate
- held_out_07_tampered_cgpa_995_q85.jpg: CGPA altered from 9.24 to 9.95 with localized recompression patch
- held_out_08_tampered_prn_forgery.jpg: PRN altered to PRN20209999
- held_out_09_tampered_degree_mismatch.jpg: Degree altered to 'Doctor of Philosophy (Ph.D.)'
- held_out_10_tampered_single_pass_fake.jpg: Single-pass synthesized diploma with fabricated claims and unanchored batch
"""

import os
import io
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HELD_OUT_DIR = os.path.join(BASE_DIR, "forensic_evaluation", "held_out_samples")
os.makedirs(HELD_OUT_DIR, exist_ok=True)

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

def render_base_diploma(name: str, prn: str, cgpa: float, degree: str, branch: str, year: int, batch_id: str, leaf_idx: int) -> Image.Image:
    W, H = 1400, 1000
    img = Image.new("RGB", (W, H), (252, 250, 244))
    d = ImageDraw.Draw(img)

    # Borders
    d.rectangle([(25, 25), (W - 25, H - 25)], outline=(197, 160, 89), width=4)
    d.rectangle([(35, 35), (W - 35, H - 35)], outline=(30, 41, 59), width=2)

    # University Header
    f_univ = get_font(32)
    f_sub = get_font(20)
    f_title = get_font(36)
    f_body = get_font(18)
    f_name = get_font(28)
    f_meta = get_font(14)

    d.text((W // 2, 85), "MGM UNIVERSITY, CHHATRAPATI SAMBHAJINAGAR", fill=(15, 23, 42), font=f_univ, anchor="mm")
    d.text((W // 2, 125), "School of Engineering & Technology", fill=(71, 85, 105), font=f_sub, anchor="mm")
    d.text((W // 2, 190), "DEGREE OF BACHELOR OF TECHNOLOGY", fill=(180, 130, 40), font=f_title, anchor="mm")

    # Award text
    d.text((W // 2, 260), "This is to certify that the degree has been conferred upon", fill=(71, 85, 105), font=f_body, anchor="mm")
    d.text((W // 2, 310), name.upper(), fill=(15, 23, 42), font=f_name, anchor="mm")
    d.text((W // 2, 360), f"for successfully completing the curriculum of {degree}", fill=(71, 85, 105), font=f_body, anchor="mm")
    d.text((W // 2, 400), f"in {branch} with Cumulative CGPA {cgpa:.2f} / 10.0", fill=(51, 65, 85), font=f_body, anchor="mm")

    # Metadata lower left
    d.text((80, 780), f"Permanent Registration No (PRN): {prn}", fill=(30, 41, 59), font=f_meta)
    d.text((80, 810), f"Graduation Year: {year} (Class of {year})", fill=(71, 85, 105), font=f_meta)
    d.text((80, 840), f"Date of Conformance: June 15, {year}", fill=(71, 85, 105), font=f_meta)

    # Authority lower right
    d.line([(W - 380, 830), (W - 80, 830)], fill=(148, 163, 184), width=1)
    d.text((W - 230, 845), "Controller of Examinations", fill=(30, 41, 59), font=f_meta, anchor="mm")
    d.text((W - 230, 865), "MGM University", fill=(100, 116, 139), font=f_meta, anchor="mm")

    # Bottom Merkle anchor watermark strip
    d.rectangle([(40, H - 70), (W - 40, H - 42)], fill=(241, 245, 249))
    d.text(
        (W // 2, H - 56),
        f"MGM University | Batch ID: {batch_id} | Leaf: #{leaf_idx} | PRN: {prn} | CGPA: {cgpa:.2f} | Sepolia Anchored",
        fill=(100, 116, 139),
        font=f_meta,
        anchor="mm"
    )

    return img

def compress(img: Image.Image, q: int) -> Image.Image:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=q)
    buf.seek(0)
    return Image.open(buf).convert("RGB")

def main():
    print("Generating held-out evaluation dataset...")

    # 1. Clean Authentic Aarav (Q95)
    img1 = render_base_diploma("Aarav Sharma", "PRN20200101", 9.24, "Bachelor of Technology", "Computer Science & Engineering", 2024, "MGM-2024-BTECH-BATCH01", 0)
    p1 = os.path.join(HELD_OUT_DIR, "held_out_01_clean_aarav_q95.jpg")
    img1.save(p1, quality=95)
    print(f"Created {p1}")

    # 2. Clean Authentic Ananya (Q90)
    img2 = render_base_diploma("Ananya Malhotra", "PRN20200102", 8.85, "Bachelor of Technology", "Artificial Intelligence & Data Science", 2024, "MGM-2024-BTECH-BATCH01", 1)
    p2 = os.path.join(HELD_OUT_DIR, "held_out_02_clean_ananya_q90.jpg")
    img2.save(p2, quality=90)
    print(f"Created {p2}")

    # 3. Clean Authentic Rohan (Q85)
    img3 = render_base_diploma("Rohan Kulkarni", "PRN20200103", 7.92, "Bachelor of Technology", "Information Technology", 2024, "MGM-2024-BTECH-BATCH01", 2)
    p3 = os.path.join(HELD_OUT_DIR, "held_out_03_clean_rohan_q85.jpg")
    img3.save(p3, quality=85)
    print(f"Created {p3}")

    # 4. Clean Scanned Noise & Blur
    img4 = img1.copy()
    # Add subtle scanner sensor noise
    arr = np.array(img4, dtype=np.int16)
    noise = np.random.normal(0, 3.5, arr.shape).astype(np.int16)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    scanned_img = Image.fromarray(arr).filter(ImageFilter.GaussianBlur(radius=0.4))
    p4 = os.path.join(HELD_OUT_DIR, "held_out_04_clean_scanned_noise.jpg")
    scanned_img.save(p4, quality=88)
    print(f"Created {p4}")

    # 5. Clean Web Recompressed (Q75)
    p5 = os.path.join(HELD_OUT_DIR, "held_out_05_clean_web_recompressed_q75.jpg")
    img2.save(p5, quality=75)
    print(f"Created {p5}")

    # 6. Tampered Name Splice ('VIKRAM ADITYA')
    base_q75 = compress(img1, 75)
    patch_name = Image.new("RGB", (600, 50), (252, 250, 244))
    d_pn = ImageDraw.Draw(patch_name)
    d_pn.text((300, 25), "VIKRAM ADITYA", fill=(15, 23, 42), font=get_font(28), anchor="mm")
    patch_name_q98 = compress(patch_name, 98)
    base_q75.paste(patch_name_q98, (400, 285))
    p6 = os.path.join(HELD_OUT_DIR, "held_out_06_tampered_name_splice_q90.jpg")
    base_q75.save(p6, quality=90)
    print(f"Created {p6}")

    # 7. Tampered CGPA (9.95 vs authentic 9.24)
    base7 = compress(img1, 80)
    patch_cgpa = Image.new("RGB", (350, 45), (252, 250, 244))
    d_pc = ImageDraw.Draw(patch_cgpa)
    d_pc.text((175, 22), "with Cumulative CGPA 9.95 / 10.0", fill=(51, 65, 85), font=get_font(18), anchor="mm")
    patch_cgpa_q99 = compress(patch_cgpa, 99)
    base7.paste(patch_cgpa_q99, (600, 380))
    p7 = os.path.join(HELD_OUT_DIR, "held_out_07_tampered_cgpa_995_q85.jpg")
    base7.save(p7, quality=85)
    print(f"Created {p7}")

    # 8. Tampered PRN (PRN20209999)
    base8 = compress(img2, 78)
    patch_prn = Image.new("RGB", (450, 35), (252, 250, 244))
    d_pp = ImageDraw.Draw(patch_prn)
    d_pp.text((10, 18), "Permanent Registration No (PRN): PRN20209999", fill=(30, 41, 59), font=get_font(14), anchor="lm")
    patch_prn_q98 = compress(patch_prn, 98)
    base8.paste(patch_prn_q98, (75, 770))
    p8 = os.path.join(HELD_OUT_DIR, "held_out_08_tampered_prn_forgery.jpg")
    base8.save(p8, quality=85)
    print(f"Created {p8}")

    # 9. Tampered Degree ('Doctor of Philosophy (Ph.D.)')
    base9 = compress(img3, 80)
    patch_deg = Image.new("RGB", (650, 45), (252, 250, 244))
    d_pd = ImageDraw.Draw(patch_deg)
    d_pd.text((325, 22), "Doctor of Philosophy (Ph.D.)", fill=(180, 130, 40), font=get_font(32), anchor="mm")
    patch_deg_q98 = compress(patch_deg, 98)
    base9.paste(patch_deg_q98, (375, 170))
    p9 = os.path.join(HELD_OUT_DIR, "held_out_09_tampered_degree_mismatch.jpg")
    base9.save(p9, quality=85)
    print(f"Created {p9}")

    # 10. Tampered Single-Pass Counterfeit (Fabricated candidate & unanchored batch)
    fake_single_pass = render_base_diploma(
        "MALICIOUS ROGUE INTRUDER",
        "PRN20209999",
        9.99,
        "Bachelor of Technology",
        "Cyber Security & Counterfeiting",
        2024,
        "UNREGISTERED-FAKE-BATCH99",
        0
    )
    p10 = os.path.join(HELD_OUT_DIR, "held_out_10_tampered_single_pass_fake.jpg")
    fake_single_pass.save(p10, quality=90)
    print(f"Created {p10}")

    print("Held-out dataset generation complete: 5 Clean, 5 Tampered (N=10).")

if __name__ == "__main__":
    main()

