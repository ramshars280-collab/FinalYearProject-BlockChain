import os
import cv2
import numpy as np
from PIL import Image
import pypdfium2 as pdfium

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_PATH = os.path.join(BASE_DIR, "certificates_pdf", "1_Authentic_Degree_Aarav_Sharma.pdf")
HELD_OUT_DIR = os.path.join(BASE_DIR, "forensic_evaluation", "held_out_samples")
os.makedirs(HELD_OUT_DIR, exist_ok=True)

# 1. Render clean base image
pdf = pdfium.PdfDocument(PDF_PATH)
base_img = pdf[0].render(scale=1.5).to_pil().convert("RGB")
w, h = base_img.size

# Condition A: Resized Certificate (scaled to 70% then back to simulate web embedding/resizing)
resized_img = base_img.resize((int(w * 0.70), int(h * 0.70)), Image.Resampling.LANCZOS)
resized_img.save(os.path.join(HELD_OUT_DIR, "held_out_11_clean_resized_70pct.jpg"), "JPEG", quality=88)
print("Created: held_out_11_clean_resized_70pct.jpg")

# Condition B: Printed and Rescanned Certificate (paper grain + illumination gradient)
img_np = np.array(base_img, dtype=np.float32)
# Add slight illumination gradient (vignette from desktop flatbed scanner)
y_coords, x_coords = np.mgrid[0:h, 0:w]
gradient = 1.0 - 0.08 * (((x_coords - w/2) / (w/2))**2 + ((y_coords - h/2) / (h/2))**2)
scanned_np = np.clip(img_np * gradient[:, :, np.newaxis], 0, 255)
# Add scanner sensor Gaussian noise
noise = np.random.normal(0, 3.5, scanned_np.shape).astype(np.float32)
scanned_np = np.clip(scanned_np + noise, 0, 255).astype(np.uint8)
scanned_img = Image.fromarray(scanned_np)
scanned_img.save(os.path.join(HELD_OUT_DIR, "held_out_12_clean_printed_rescanned.jpg"), "JPEG", quality=82)
print("Created: held_out_12_clean_printed_rescanned.jpg")

# Condition C: Tampered Sample with Replaced Institutional Logo
# Take logo region [top: 60 to 180, left: 100 to 220]
# Paste a distinct logo compressed at Q=60 into the Q=90 document
tampered_logo_np = np.array(base_img).copy()
logo_region = base_img.crop((100, 60, 250, 200))
# Recompress patch at Q=60 with distinct compression artifacts
import io
buf = io.BytesIO()
logo_region.save(buf, format="JPEG", quality=60)
buf.seek(0)
spliced_logo = Image.open(buf).convert("RGB")
# Splicing into document
tampered_logo_img = base_img.copy()
tampered_logo_img.paste(spliced_logo, (100, 60))
tampered_logo_img.save(os.path.join(HELD_OUT_DIR, "held_out_13_tampered_replaced_logo_q60.jpg"), "JPEG", quality=90)
print("Created: held_out_13_tampered_replaced_logo_q60.jpg")

# Condition D: Tampered Sample with Pasted Text Region (Branch modification)
# Splice "Artificial Intelligence & Data Science" pasted into branch field
tampered_branch_img = base_img.copy()
branch_crop = base_img.crop((400, 420, 850, 470))
buf2 = io.BytesIO()
branch_crop.save(buf2, format="JPEG", quality=55)
buf2.seek(0)
spliced_branch = Image.open(buf2).convert("RGB")
tampered_branch_img.paste(spliced_branch, (400, 420))
tampered_branch_img.save(os.path.join(HELD_OUT_DIR, "held_out_14_tampered_pasted_branch_q55.jpg"), "JPEG", quality=90)
print("Created: held_out_14_tampered_pasted_branch_q55.jpg")

print("All additional evaluation conditions generated successfully!")
