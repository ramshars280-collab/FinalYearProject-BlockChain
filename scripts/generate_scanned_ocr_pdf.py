import os
import subprocess
import sys
from PIL import Image

# 1. Locate Chrome / Edge browser
browser_paths = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

browser_exe = None
for p in browser_paths:
    if os.path.exists(p):
        browser_exe = p
        break

if not browser_exe:
    print("Error: No Chrome or Edge executable found.")
    sys.exit(1)

print(f"Using browser: {browser_exe}")

# 2. Paths
base_dir = r"c:\Final-Year-Project-Blockchain"
temp_html = os.path.join(base_dir, "scratch", "temp_scanned_cert.html")
temp_png = os.path.join(base_dir, "scratch", "temp_scanned_cert.png")
output_pdf_root = os.path.join(base_dir, "6_Scanned_OCR_Degree_Aarav_Sharma.pdf")
output_pdf_public = os.path.join(base_dir, "public", "certificates_pdf", "6_Scanned_OCR_Degree_Aarav_Sharma.pdf")

os.makedirs(os.path.dirname(temp_html), exist_ok=True)
os.makedirs(os.path.dirname(output_pdf_public), exist_ok=True)

# 3. HTML Certificate template (exact replica of authentic degree certificate)
html_content = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Aarav Sharma - Scanned Degree Certificate</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    body {
      margin: 0;
      padding: 0;
      width: 1122px;
      height: 793px;
      font-family: 'Times New Roman', Georgia, serif;
      background-color: #fdfbf7;
      color: #0f172a;
      box-sizing: border-box;
    }
    .cert-container {
      position: relative;
      width: 100%;
      height: 100%;
      padding: 40px 50px;
      box-sizing: border-box;
      border: 14px solid #1e3a8a;
      background: radial-gradient(circle at center, #ffffff 0%, #faf8f5 100%);
    }
    .inner-border {
      position: relative;
      width: 100%;
      height: 100%;
      border: 3px double #94a3b8;
      padding: 30px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      text-align: center;
    }
    .header-logo {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
      margin-bottom: 10px;
    }
    .logo-badge {
      width: 50px;
      height: 50px;
      background: linear-gradient(135deg, #1d4ed8, #1e3a8a);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 24px;
      font-weight: bold;
    }
    .univ-title {
      font-size: 32px;
      font-weight: 900;
      color: #1e3a8a;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin: 0;
    }
    .univ-sub {
      font-size: 13px;
      color: #475569;
      font-style: italic;
      margin-top: 3px;
    }
    .cert-heading {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 4px;
      margin: 15px 0 5px 0;
      border-bottom: 2px solid #cbd5e1;
      display: inline-block;
      padding-bottom: 5px;
    }
    .cert-body {
      font-size: 16px;
      line-height: 1.8;
      color: #1e293b;
      margin: 10px 0;
    }
    .student-name {
      font-size: 30px;
      font-weight: 900;
      color: #1d4ed8;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 5px 0;
      font-family: Arial, sans-serif;
    }
    .degree-name {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      margin: 5px 0;
    }
    .details-row {
      display: flex;
      justify-content: space-around;
      margin: 15px 0;
      font-size: 14px;
      background: #f1f5f9;
      padding: 10px 20px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .details-item span {
      font-weight: bold;
      color: #1e3a8a;
    }
    .footer-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 15px;
    }
    .seal-box {
      width: 100px;
      height: 100px;
      border: 3px dashed #1e3a8a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: bold;
      color: #1e3a8a;
      text-transform: uppercase;
      margin: 0 auto;
    }
    .sig-box {
      text-align: center;
      font-size: 12px;
      color: #334155;
    }
    .sig-line {
      width: 160px;
      border-top: 2px solid #475569;
      margin-bottom: 5px;
    }
    .scanned-watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-25deg);
      font-size: 55px;
      font-weight: 900;
      color: rgba(220, 38, 38, 0.12);
      text-transform: uppercase;
      letter-spacing: 8px;
      pointer-events: none;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="cert-container">
    <div class="inner-border">
      <div class="scanned-watermark">SCANNED IMAGE DIPLOMA</div>
      
      <div>
        <div class="header-logo">
          <div class="logo-badge">MGM</div>
          <div>
            <h1 class="univ-title">MGM UNIVERSITY</h1>
            <div class="univ-sub">Chhatrapati Sambhajinagar, Maharashtra, India • Established under Act No. XXVI</div>
          </div>
        </div>
        <div class="cert-heading">BACHELOR OF TECHNOLOGY DEGREE</div>
      </div>

      <div class="cert-body">
        This is to certify that
        <div class="student-name">AARAV SHARMA</div>
        having successfully completed the prescribed course of study and passed the examination
        has been admitted to the degree of
        <div class="degree-name">B.Tech Computer Science &amp; Engineering</div>
      </div>

      <div class="details-row">
        <div class="details-item">PRN: <span>PRN20200101</span></div>
        <div class="details-item">Cumulative GPA: <span>9.24 / 10.00</span></div>
        <div class="details-item">Graduation Year: <span>2024</span></div>
        <div class="details-item">Batch ID: <span>MGM-2024-BTECH-BATCH01</span></div>
      </div>

      <div class="footer-row">
        <div class="sig-box">
          <div class="sig-line"></div>
          <strong>Dr. S. N. Deshmukh</strong><br>Controller of Examinations
        </div>

        <div class="seal-box">
          OFFICIAL<br>MGM SEAL<br>2024
        </div>

        <div class="sig-box">
          <div class="sig-line"></div>
          <strong>Prof. V. M. Pandharipande</strong><br>Vice-Chancellor
        </div>
      </div>
    </div>
  </div>
</body>
</html>
"""

with open(temp_html, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Temporary HTML written to: {temp_html}")

# 4. Render HTML to high-res PNG image using Chrome headless screenshot
print("Rendering HTML to PNG image via Chrome...")
cmd = [
    browser_exe,
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1122,793",
    f"--screenshot={temp_png}",
    temp_html,
]
subprocess.run(cmd, check=True)

if not os.path.exists(temp_png):
    print("Error: PNG screenshot failed to generate.")
    sys.exit(1)

print(f"PNG screenshot created: {temp_png} ({os.path.getsize(temp_png)} bytes)")

# 5. Convert PNG image to pure raster PDF (Zero text streams)
img = Image.open(temp_png).convert("RGB")
img.save(output_pdf_root, "PDF", resolution=100.0)
img.save(output_pdf_public, "PDF", resolution=100.0)

print("--- SCANNED PDF CREATED SUCCESSFULLY ---")
print(f"Root Output: {output_pdf_root} ({os.path.getsize(output_pdf_root)} bytes)")
print(f"Public Output: {output_pdf_public} ({os.path.getsize(output_pdf_public)} bytes)")
