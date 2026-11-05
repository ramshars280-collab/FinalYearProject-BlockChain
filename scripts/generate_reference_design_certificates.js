const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const QRCode = require('qrcode');

// Locate Chromium browser executable
const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browserExe = chromePaths.find(p => fs.existsSync(p));
if (!browserExe) {
  console.error('No Chromium browser found for PDF generation');
  process.exit(1);
}
console.log('Using browser engine:', browserExe);

// Directories
const outputDirRoot = path.join(__dirname, '..', 'certificates_pdf', 'reference_design');
const outputDirPublic = path.join(__dirname, '..', 'public', 'certificates_pdf', 'reference_design');

if (!fs.existsSync(outputDirRoot)) fs.mkdirSync(outputDirRoot, { recursive: true });
if (!fs.existsSync(outputDirPublic)) fs.mkdirSync(outputDirPublic, { recursive: true });

// Vector SVG Signature paths in authentic dark blue ink (#1e40af)
const demoSignatureLeftSvg = `
<svg width="130" height="38" viewBox="0 0 130 38" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 26C20 16 32 10 38 14C44 18 36 30 28 28C20 26 34 8 46 12C58 16 52 32 64 26C74 20 88 14 100 16C110 18 116 26 124 23" stroke="#1e40af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M25 22C42 21 80 20 104 22" stroke="#1e40af" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

const demoSignatureRightSvg = `
<svg width="130" height="38" viewBox="0 0 130 38" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 24C24 23 28 12 40 14C52 16 46 30 58 24C70 18 80 14 90 16C100 19 108 28 122 22" stroke="#1e40af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M34 16C48 12 72 26 86 20C98 14 110 18 118 17" stroke="#1e40af" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

async function generateCertificateHtml(cert) {
  // Generate unique high-resolution QR code data URL encoding public verification URL
  const qrDataUrl = await QRCode.toDataURL(cert.verifyUrl, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${cert.studentName} - Graduation Certificate</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 landscape;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: 297mm;
      height: 210mm;
      margin: 0;
      padding: 12mm 14mm;
      background: #faf8f0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .cert-frame {
      position: relative;
      width: 271mm;
      height: 186mm;
      background: #fbf9f2;
      background-image: radial-gradient(circle at 50% 50%, #ffffff 0%, #faf6eb 100%);
      border: 1.6px solid #282624;
      padding: 15mm 24mm 12mm 24mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      text-align: center;
      overflow: hidden;
    }
    .content-layer {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      height: 100%;
      justify-content: space-between;
    }
    
    /* Top Section */
    .top-section {
      margin-top: 1mm;
    }
    .main-title {
      font-family: 'Oswald', 'Bahnschrift', 'Arial Narrow', sans-serif;
      font-size: 44pt;
      font-weight: 600;
      color: #22211f;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      line-height: 1.1;
      white-space: nowrap;
    }
    .subtitle {
      font-size: 13pt;
      font-weight: 400;
      color: #55534f;
      margin-top: 7mm;
      letter-spacing: 0.3px;
    }
    .student-name {
      font-family: 'Oswald', 'Bahnschrift', 'Arial Narrow', sans-serif;
      font-size: 38pt;
      font-weight: 700;
      color: #1a1918;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 3.5mm;
      line-height: 1.15;
    }
    
    /* Middle Achievement Section */
    .achievement-section {
      margin-top: 1mm;
      font-size: 11.5pt;
      line-height: 1.7;
      color: #383633;
    }
    .achievement-section p {
      margin: 1.2mm 0;
    }
    .achievement-section strong {
      font-weight: 700;
      color: #1a1918;
    }
    
    /* Prominent Demonstration Disclaimer Banner */
    .disclaimer-wrap {
      margin: 3mm auto 2mm auto;
    }
    .demo-disclaimer-banner {
      border: 1.8px solid #991b1b;
      background: #fef2f2;
      color: #991b1b;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 9.5pt;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      padding: 4.5px 24px;
      border-radius: 4px;
      display: inline-block;
      box-shadow: 0 1px 3px rgba(153, 27, 27, 0.08);
    }
    
    /* Bottom Section: Signatures & Center QR / Details */
    .bottom-section {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: end;
      padding-top: 2mm;
      margin-bottom: 0mm;
    }
    .signatory-col {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .sig-svg {
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 2px;
    }
    .sig-name {
      font-size: 11pt;
      font-weight: 700;
      color: #22211f;
      line-height: 1.2;
    }
    .sig-title {
      font-size: 9.5pt;
      color: #55534f;
      margin-top: 1.5px;
      font-weight: 400;
    }
    
    .cert-center-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      padding: 0 24px 1px 24px;
    }
    .qr-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 2mm;
    }
    .qr-code-img {
      width: 52px;
      height: 52px;
      padding: 2px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
      display: block;
    }
    .qr-label {
      font-size: 6.8pt;
      font-weight: 600;
      color: #64748b;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .cert-no {
      font-size: 10.5pt;
      font-weight: 600;
      color: #242321;
      letter-spacing: 0.3px;
    }
    .cert-date {
      font-size: 9.5pt;
      font-weight: 500;
      color: #383633;
      margin-top: 1.5px;
    }
  </style>
</head>
<body>
  <div class="cert-frame">
    <div class="content-layer">
      <!-- Top Title, Subtitle, Student Name -->
      <div class="top-section">
        <h1 class="main-title">GRADUATION CERTIFICATE</h1>
        <div class="subtitle">The certificate is awarded</div>
        <div class="student-name">${cert.studentName}</div>
      </div>
      
      <!-- Achievement Statement -->
      <div class="achievement-section">
        <p>For successful completion of a <strong>${cert.degree} in ${cert.branch}</strong>.</p>
        <p>In recognition of outstanding academic achievement with a <strong>Cumulative CGPA of ${cert.cgpa}</strong></p>
        <p>and professional excellence.</p>
      </div>
      
      <!-- Required Demonstration Disclaimer Banner -->
      <div class="disclaimer-wrap">
        <div class="demo-disclaimer-banner">
          FOR DEMONSTRATION PURPOSES ONLY — NOT AN OFFICIALLY ISSUED DEGREE CERTIFICATE
        </div>
      </div>
      
      <!-- Bottom Section: Signatures & Certificate Details with Centered QR Code -->
      <div class="bottom-section">
        <!-- Left Demonstration Signatory -->
        <div class="signatory-col" style="align-items: flex-start; padding-left: 4mm;">
          <div class="sig-svg">
            ${demoSignatureLeftSvg}
          </div>
          <div class="sig-name">Demo Examination Officer</div>
          <div class="sig-title">Examination Cell</div>
        </div>
        
        <!-- Center QR Code, Certificate ID & Date -->
        <div class="cert-center-col">
          <div class="qr-container">
            <img src="${qrDataUrl}" alt="Verification QR Code" class="qr-code-img" />
            <span class="qr-label">Scan to Verify</span>
          </div>
          <div class="cert-no">Certificate NO: ${cert.certNumber}</div>
          <div class="cert-date">Date of issue: ${cert.issueDateFormatted}</div>
        </div>
        
        <!-- Right Demonstration Signatory -->
        <div class="signatory-col" style="align-items: flex-end; padding-right: 4mm;">
          <div class="sig-svg">
            ${demoSignatureRightSvg}
          </div>
          <div class="sig-name">Demo University Authority</div>
          <div class="sig-title">University Authority</div>
        </div>
      </div>
    </div>
    
    <!-- Invisible verifier provenance layer: 100% extractable by pdfjs-dist, zero visual presence on certificate -->
    <div style="position: absolute; bottom: 1mm; left: 10mm; color: rgba(251, 249, 242, 0.01); font-family: monospace; font-size: 7pt; user-select: none; pointer-events: none;">
      Batch ID: ${cert.batchId} Leaf: #${cert.leafIndex} PRN: ${cert.prn} CUMULATIVE CGPA ${cert.cgpa} Degree of ${cert.degree} Root: ${cert.merkleRoot} Sepolia: ${cert.contractAddress}
    </div>
  </div>
</body>
</html>`;
}

async function renderPdf(htmlContent, outputPdfPath) {
  const tempHtmlPath = outputPdfPath.replace(/\.pdf$/i, '_temp.html');
  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');

  try {
    const cmd = `"${browserExe}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${outputPdfPath}" "${tempHtmlPath}"`;
    execSync(cmd, { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
  }
}

async function main() {
  console.log('--- Generating Clean High-Fidelity Reference-Design Graduation Certificates with Functional QR Codes ---');

  const certificates = [
    {
      fileName: 'SOET-SEPOLIA-2026-TEST01_DEMO-CSE-2026-001.pdf',
      studentName: 'DEMO STUDENT 001',
      prn: 'DEMO-CSE-2026-001',
      degree: 'Bachelor of Technology',
      branch: 'Computer Science and Engineering',
      cgpa: '8.50',
      graduationYear: '2026',
      certNumber: '46585956',
      issueDateFormatted: '03.11.2026',
      batchId: 'SOET-SEPOLIA-2026-TEST01',
      leafIndex: 0,
      verifyUrl: 'http://localhost:3000/?verify=SOET-SEPOLIA-2026-TEST01/0',
      merkleRoot: '0x205922992987d8af45e571ab4a64b029e00a1c0bdef87bce9673752e084fd952',
      contractAddress: '0xe7Cc39AF2ACC1dd637C863aB5DB18aC904b76Bc4',
    },
    {
      fileName: 'SOET-SEPOLIA-2026-TEST01_DEMO-CSE-2026-002.pdf',
      studentName: 'DEMO STUDENT 002',
      prn: 'DEMO-CSE-2026-002',
      degree: 'Bachelor of Technology',
      branch: 'Computer Science and Engineering',
      cgpa: '8.75',
      graduationYear: '2026',
      certNumber: '46585957',
      issueDateFormatted: '03.11.2026',
      batchId: 'SOET-SEPOLIA-2026-TEST01',
      leafIndex: 1,
      verifyUrl: 'http://localhost:3000/?verify=SOET-SEPOLIA-2026-TEST01/1',
      merkleRoot: '0x205922992987d8af45e571ab4a64b029e00a1c0bdef87bce9673752e084fd952',
      contractAddress: '0xe7Cc39AF2ACC1dd637C863aB5DB18aC904b76Bc4',
    },
    {
      fileName: 'SOET-SEPOLIA-2026-TEST01_DEMO-CSE-2026-003.pdf',
      studentName: 'DEMO STUDENT 003',
      prn: 'DEMO-CSE-2026-003',
      degree: 'Bachelor of Technology',
      branch: 'Computer Science and Engineering',
      cgpa: '9.00',
      graduationYear: '2026',
      certNumber: '46585958',
      issueDateFormatted: '03.11.2026',
      batchId: 'SOET-SEPOLIA-2026-TEST01',
      leafIndex: 2,
      verifyUrl: 'http://localhost:3000/?verify=SOET-SEPOLIA-2026-TEST01/2',
      merkleRoot: '0x205922992987d8af45e571ab4a64b029e00a1c0bdef87bce9673752e084fd952',
      contractAddress: '0xe7Cc39AF2ACC1dd637C863aB5DB18aC904b76Bc4',
    }
  ];

  for (const cert of certificates) {
    console.log(`Rendering PDF: ${cert.fileName}... (URL: ${cert.verifyUrl})`);
    const html = await generateCertificateHtml(cert);
    
    const rootPath = path.join(outputDirRoot, cert.fileName);
    const publicPath = path.join(outputDirPublic, cert.fileName);

    await renderPdf(html, rootPath);
    // Mirror to public folder
    fs.copyFileSync(rootPath, publicPath);

    const size = fs.statSync(rootPath).size;
    console.log(`  -> Successfully created: ${cert.fileName} (${(size / 1024).toFixed(1)} KB)`);
  }

  console.log('--- ALL REFERENCE-DESIGN CERTIFICATES SUCCESSFULLY GENERATED ---');
}

module.exports = { generateCertificateHtml };

if (require.main === module) {
  main().catch(err => {
    console.error('Generation failed:', err);
    process.exit(1);
  });
}
