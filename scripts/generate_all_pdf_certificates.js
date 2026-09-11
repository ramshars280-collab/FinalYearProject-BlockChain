const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const QRCode = require('qrcode');

// Select Chrome or Edge
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
const outputDirRoot = path.join(__dirname, '..', 'certificates_pdf');
const outputDirPublic = path.join(__dirname, '..', 'public', 'certificates_pdf');

if (!fs.existsSync(outputDirRoot)) fs.mkdirSync(outputDirRoot, { recursive: true });
if (!fs.existsSync(outputDirPublic)) fs.mkdirSync(outputDirPublic, { recursive: true });

// SVG Icons
const graduationCapSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/>
  <path d="M22 10v6"/>
  <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>
</svg>`;

const shieldCheckSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
  <path d="m9 12 2 2 4-4"/>
</svg>`;

const sealAwardSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="8" r="7"/>
  <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
</svg>`;

async function generateCertificateHtml(cert) {
  const qrDataUrl = await QRCode.toDataURL(cert.verifyUrl, {
    width: 200,
    margin: 1,
    color: { dark: '#0f172a', light: '#ffffff' }
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${cert.studentName} - Degree Certificate</title>
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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 297mm;
      height: 210mm;
      margin: 0;
      padding: 7mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .cert-container {
      position: relative;
      width: 100%;
      height: 100%;
      background-color: #ffffff;
      background-image: 
        radial-gradient(circle at 50% 50%, rgba(30, 58, 138, 0.02) 0%, transparent 70%),
        repeating-linear-gradient(45deg, rgba(30, 58, 138, 0.012) 0px, rgba(30, 58, 138, 0.012) 2px, transparent 2px, transparent 10px),
        repeating-linear-gradient(-45deg, rgba(30, 58, 138, 0.012) 0px, rgba(30, 58, 138, 0.012) 2px, transparent 2px, transparent 10px);
      border: 8px double #1e3a8a;
      outline: 2px solid #2563eb;
      outline-offset: -12px;
      padding: 16px 28px 12px 28px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-25deg);
      font-size: ${cert.watermark ? '84px' : '0px'};
      font-weight: 900;
      color: ${cert.watermarkColor || 'rgba(220, 38, 38, 0.12)'};
      letter-spacing: 12px;
      pointer-events: none;
      z-index: 1;
      text-transform: uppercase;
      border: ${cert.watermark ? `6px dashed ${cert.watermarkColor || 'rgba(220, 38, 38, 0.2)'}` : 'none'};
      padding: 12px 36px;
      border-radius: 16px;
    }
    .corner-tag {
      position: absolute;
      font-family: monospace;
      font-size: 10px;
      font-weight: 800;
      color: #1e3a8a;
      padding: 3px 6px;
    }
    .corner-tl { top: 16px; left: 16px; border-top: 2px solid #1e3a8a; border-left: 2px solid #1e3a8a; }
    .corner-tr { top: 16px; right: 16px; border-top: 2px solid #1e3a8a; border-right: 2px solid #1e3a8a; }
    .corner-bl { bottom: 16px; left: 16px; border-bottom: 2px solid #1e3a8a; border-left: 2px solid #1e3a8a; }
    .corner-br { bottom: 16px; right: 16px; border-bottom: 2px solid #1e3a8a; border-right: 2px solid #1e3a8a; }
    
    .header {
      text-align: center;
      position: relative;
      z-index: 2;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
    }
    .crest {
      width: 58px;
      height: 58px;
      margin: 0 auto 6px auto;
      border-radius: 50%;
      background: linear-gradient(135deg, #1d4ed8, #1e3a8a);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(30, 58, 138, 0.35);
      border: 4px solid #dbeafe;
    }
    .uni-title {
      font-family: "Georgia", "Times New Roman", serif;
      font-size: 23px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    .uni-subtitle {
      font-family: "Georgia", "Times New Roman", serif;
      font-style: italic;
      font-size: 10px;
      color: #475569;
      margin-top: 2px;
    }
    .anchor-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e3a8a;
      padding: 2px 14px;
      border-radius: 9999px;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-top: 4px;
    }
    
    .body-content {
      text-align: center;
      position: relative;
      z-index: 2;
      margin: 4px 0;
    }
    .conferment-text {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 2px;
      color: #64748b;
      text-transform: uppercase;
    }
    .degree-name {
      font-family: "Georgia", "Times New Roman", serif;
      font-size: 26px;
      font-weight: 900;
      color: #0f172a;
      margin-top: 2px;
      letter-spacing: -0.5px;
    }
    .branch-name {
      font-family: "Georgia", "Times New Roman", serif;
      font-style: italic;
      font-size: 15px;
      font-weight: 700;
      color: #1e40af;
      margin-top: 1px;
    }
    .upon-text {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #64748b;
      text-transform: uppercase;
      margin: 4px 0 2px 0;
    }
    .student-name {
      font-family: "Georgia", "Times New Roman", serif;
      font-size: 28px;
      font-weight: 900;
      color: #020617;
      text-decoration: underline;
      text-decoration-color: #2563eb;
      text-decoration-thickness: 3px;
      text-underline-offset: 6px;
      padding: 1px 0;
    }
    .nheqf-text {
      font-size: 9.5px;
      color: #475569;
      max-width: 720px;
      margin: 8px auto 0 auto;
      line-height: 1.35;
    }
    
    .badges-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      max-width: 680px;
      margin: 8px auto 0 auto;
    }
    .badge-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 5px 6px;
      text-align: center;
    }
    .badge-label {
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.5px;
      display: block;
    }
    .badge-value {
      font-size: 11px;
      font-weight: 900;
      color: #0f172a;
      margin-top: 2px;
      display: block;
    }
    .badge-cgpa {
      font-family: "Georgia", serif;
      color: ${cert.cgpaHighlightColor || '#1e3a8a'};
      font-size: 12.5px;
    }
    
    .signatures-row {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1fr 1.2fr;
      align-items: end;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      position: relative;
      z-index: 2;
    }
    .sig-col {
      text-align: center;
    }
    .sig-name {
      font-family: "Brush Script MT", "Times New Roman", cursive, serif;
      font-size: 17px;
      font-weight: 700;
      color: #0f172a;
    }
    .sig-line {
      width: 110px;
      height: 1.5px;
      background: #94a3b8;
      margin: 2px auto;
    }
    .sig-role {
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.5px;
    }
    
    .seal-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .seal-circle {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      border: 3px solid #1e3a8a;
      background: radial-gradient(circle, #eff6ff 0%, #dbeafe 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(30, 58, 138, 0.2);
    }
    .seal-text {
      font-size: 6.5px;
      font-weight: 900;
      color: #1e3a8a;
      text-transform: uppercase;
      letter-spacing: -0.2px;
      margin-top: 1px;
    }
    .seal-label {
      font-size: 8px;
      color: #64748b;
      font-weight: 600;
      margin-top: 2px;
    }
    
    .qr-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .qr-box {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      padding: 3px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .qr-box img {
      width: 50px;
      height: 50px;
      display: block;
    }
    .qr-caption {
      font-size: 8px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: 3px;
    }
    
    .anchor-bar {
      border-top: 1px solid #cbd5e1;
      background: #f8fafc;
      margin: 8px -28px -12px -28px;
      padding: 5px 28px;
      font-family: monospace;
      font-size: 8.5px;
      color: #475569;
      position: relative;
      z-index: 2;
    }
    .anchor-flex {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .status-alert {
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 800;
      font-size: 8px;
      text-transform: uppercase;
    }
    .status-valid { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .status-tampered { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .status-fake { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
  </style>
</head>
<body>
  <div class="cert-container">
    ${cert.watermark ? `<div class="watermark">${cert.watermark}</div>` : ''}
    
    <div class="corner-tag corner-tl">MGMU</div>
    <div class="corner-tag corner-tr">2024</div>
    <div class="corner-tag corner-bl">SEPOLIA</div>
    <div class="corner-tag corner-br">EVM</div>
    
    <!-- HEADER -->
    <div class="header">
      <div class="crest">
        ${graduationCapSvg}
      </div>
      <h1 class="uni-title">${cert.university}</h1>
      <p class="uni-subtitle">Maharashtra, India &bull; Established under Maharashtra Act No. XXVI of 2019 &bull; Academic Consortium</p>
      <div class="anchor-badge">
        ${shieldCheckSvg}
        <span>Inter-University Consortium Anchor &bull; Sepolia Testnet</span>
      </div>
    </div>
    
    <!-- BODY -->
    <div class="body-content">
      <p class="conferment-text">The Board of Management and the Academic Council hereby confer the degree of</p>
      <h2 class="degree-name">${cert.degree}</h2>
      <p class="branch-name">in ${cert.branch}</p>
      <p class="upon-text">upon</p>
      <div class="student-name">${cert.studentName}</div>
      <p class="nheqf-text">
        who has successfully fulfilled all academic requirements, practical dissertations, and examinations prescribed by the university under the National Higher Education Qualifications Framework (NHEQF).
      </p>
      
      <!-- BADGES -->
      <div class="badges-grid">
        <div class="badge-card">
          <span class="badge-label">Permanent Reg. No.</span>
          <span class="badge-value" style="font-family: monospace;">${cert.prn}</span>
        </div>
        <div class="badge-card">
          <span class="badge-label">Cumulative CGPA</span>
          <span class="badge-value badge-cgpa">${cert.cgpa} / 10.0</span>
        </div>
        <div class="badge-card">
          <span class="badge-label">Graduation Year</span>
          <span class="badge-value" style="font-family: monospace;">${cert.graduationYear}</span>
        </div>
        <div class="badge-card">
          <span class="badge-label">NHEQF Level</span>
          <span class="badge-value" style="color: #065f46;">Level ${cert.nheqfLevel}</span>
        </div>
      </div>
    </div>
    
    <!-- SIGNATURES, SEAL & QR -->
    <div class="signatures-row">
      <div class="sig-col">
        <div class="sig-name">Dr. S. K. Mahajan</div>
        <div class="sig-line"></div>
        <div class="sig-role">Dean, Faculty of Engineering</div>
      </div>
      
      <div class="seal-wrap">
        <div class="seal-circle">
          ${sealAwardSvg}
          <span class="seal-text">AUTHENTIC</span>
        </div>
        <span class="seal-label">Official University Seal</span>
      </div>
      
      <div class="qr-wrap">
        <div class="qr-box">
          <img src="${qrDataUrl}" alt="Verification QR Code" />
        </div>
        <span class="qr-caption">Scan to Verify</span>
      </div>
      
      <div class="sig-col">
        <div class="sig-name">Prof. V. M. Deshpande</div>
        <div class="sig-line"></div>
        <div class="sig-role">Controller of Examinations</div>
      </div>
    </div>
    
    <!-- ANCHOR BAR -->
    <div class="anchor-bar">
      <div class="anchor-flex">
        <div>
          <strong>Merkle Root:</strong> ${cert.merkleRoot} &bull; <strong>Batch ID:</strong> ${cert.batchId} &bull; <strong>Leaf:</strong> #${cert.leafIndex}
        </div>
        <div>
          <span class="status-alert ${cert.statusClass}">${cert.statusText}</span>
        </div>
      </div>
      <div class="anchor-flex" style="margin-top: 2px; font-size: 7.5px; color: #64748b;">
        <span>Contract: 0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7 &bull; Chain ID: 11155111 (Sepolia)</span>
        <span>DPDP Act 2023 Compliant &bull; Zero PII On-Chain</span>
      </div>
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
  console.log('--- Generating High-Fidelity PDF Degree Test Suite ---');

  const certificates = [
    {
      fileName: '1_Authentic_Degree_Aarav_Sharma.pdf',
      studentName: 'Aarav Sharma',
      prn: 'PRN20200101',
      degree: 'Bachelor of Technology',
      branch: 'Computer Science & Engineering',
      cgpa: '9.24',
      graduationYear: '2024',
      nheqfLevel: '6.0',
      university: 'MGM UNIVERSITY, CHHATRAPATI SAMBHAJINAGAR',
      merkleRoot: '0xde333280••••••••7744eb33',
      batchId: 'MGM-2024-BTECH-BATCH01',
      leafIndex: 0,
      verifyUrl: 'http://localhost:3000/?verify=MGM-2024-BTECH-BATCH01/0',
      statusText: '100% VALID &bull; ON-CHAIN VERIFIED',
      statusClass: 'status-valid',
    },
    {
      fileName: '2_Authentic_Degree_Ananya_Deshmukh.pdf',
      studentName: 'Ananya Deshmukh',
      prn: 'PRN20200102',
      degree: 'Bachelor of Technology',
      branch: 'Artificial Intelligence & Data Science',
      cgpa: '8.85',
      graduationYear: '2024',
      nheqfLevel: '6.0',
      university: 'MGM UNIVERSITY, CHHATRAPATI SAMBHAJINAGAR',
      merkleRoot: '0xde333280••••••••7744eb33',
      batchId: 'MGM-2024-BTECH-BATCH01',
      leafIndex: 1,
      verifyUrl: 'http://localhost:3000/?verify=MGM-2024-BTECH-BATCH01/1',
      statusText: '100% VALID &bull; ON-CHAIN VERIFIED',
      statusClass: 'status-valid',
    },
    {
      fileName: '3_Tampered_GPA_Degree_Aarav_Sharma.pdf',
      studentName: 'Aarav Sharma',
      prn: 'PRN20200101',
      degree: 'Bachelor of Technology',
      branch: 'Computer Science & Engineering',
      cgpa: '9.92', // FORGED from 9.24
      cgpaHighlightColor: '#dc2626', // Red highlight on forged GPA
      graduationYear: '2024',
      nheqfLevel: '6.0',
      university: 'MGM UNIVERSITY, CHHATRAPATI SAMBHAJINAGAR',
      merkleRoot: '0xde333280••••••••7744eb33',
      batchId: 'MGM-2024-BTECH-BATCH01',
      leafIndex: 0,
      watermark: 'TAMPERED GPA',
      watermarkColor: 'rgba(220, 38, 38, 0.15)',
      verifyUrl: 'http://localhost:3000/?verify=MGM-2024-BTECH-BATCH01/0',
      statusText: 'FRAUD: GPA ALTERED (9.24 -> 9.92)',
      statusClass: 'status-tampered',
    },
    {
      fileName: '4_Fake_Unregistered_Degree_Vikrant_Verma.pdf',
      studentName: 'Vikrant R. Verma',
      prn: 'PRN20249999', // Fabricated PRN
      degree: 'Bachelor of Technology',
      branch: 'Cyber Security & Digital Forensics',
      cgpa: '9.75',
      cgpaHighlightColor: '#b45309',
      graduationYear: '2024',
      nheqfLevel: '6.0',
      university: 'MGM UNIVERSITY, CHHATRAPATI SAMBHAJINAGAR',
      merkleRoot: '0x00000000••••••••00000000',
      batchId: 'MGM-2024-FAKE-BATCH99',
      leafIndex: 0,
      watermark: 'COUNTERFEIT DEGREE',
      watermarkColor: 'rgba(217, 119, 6, 0.15)',
      verifyUrl: 'http://localhost:3000/?verify=MGM-2024-FAKE-BATCH99/0',
      statusText: 'UNREGISTERED &bull; FORGED RECORD',
      statusClass: 'status-fake',
    },
    {
      fileName: '5_Revoked_Degree_Pooja_Patil.pdf',
      studentName: 'Pooja Patil',
      prn: 'PRN20200104',
      degree: 'Bachelor of Technology',
      branch: 'Electronics & Computer Engineering',
      cgpa: '8.41',
      graduationYear: '2024',
      nheqfLevel: '6.0',
      university: 'MGM UNIVERSITY, CHHATRAPATI SAMBHAJINAGAR',
      merkleRoot: '0xde333280••••••••7744eb33',
      batchId: 'MGM-2024-BTECH-BATCH01',
      leafIndex: 3,
      watermark: 'REVOKED',
      watermarkColor: 'rgba(220, 38, 38, 0.18)',
      verifyUrl: 'http://localhost:3000/?verify=MGM-2024-BTECH-BATCH01/3',
      statusText: 'REVOKED BY EXAM AUTHORITY',
      statusClass: 'status-tampered',
    }
  ];

  for (const cert of certificates) {
    console.log(`Rendering PDF: ${cert.fileName}...`);
    const html = await generateCertificateHtml(cert);
    
    const rootPath = path.join(outputDirRoot, cert.fileName);
    const publicPath = path.join(outputDirPublic, cert.fileName);

    await renderPdf(html, rootPath);
    // Copy to public folder as well
    fs.copyFileSync(rootPath, publicPath);

    const size = fs.statSync(rootPath).size;
    console.log(`  -> Successfully created: ${cert.fileName} (${(size / 1024).toFixed(1)} KB)`);
  }

  // Also write an informative index summary in certificates_pdf/README.txt
  const summaryContent = `========================================================================
MGM UNIVERSITY - BLOCKCHAIN ACADEMIC DEGREE VERIFICATION TEST SUITE
========================================================================
Generated on: ${new Date().toLocaleString()}
Design: Exact replica of DegreeCertificate.tsx (Guilloche border, seal, QR, Merkle anchor)

FILES INCLUDED IN THIS DIRECTORY:

1. 1_Authentic_Degree_Aarav_Sharma.pdf
   - Status: 100% VALID & AUTHENTIC
   - Student: Aarav Sharma (PRN20200101)
   - Degree: B.Tech Computer Science & Engineering
   - CGPA: 9.24 / 10.0 (Matches on-chain root)
   - QR Scans to: http://localhost:3000/?verify=MGM-2024-BTECH-BATCH01/0

2. 2_Authentic_Degree_Ananya_Deshmukh.pdf
   - Status: 100% VALID & AUTHENTIC
   - Student: Ananya Deshmukh (PRN20200102)
   - Degree: B.Tech Artificial Intelligence & Data Science
   - CGPA: 8.85 / 10.0 (Matches on-chain root)
   - QR Scans to: http://localhost:3000/?verify=MGM-2024-BTECH-BATCH01/1

3. 3_Tampered_GPA_Degree_Aarav_Sharma.pdf
   - Status: FRAUD / TAMPER DETECTED
   - Student: Aarav Sharma (PRN20200101)
   - Degree: B.Tech Computer Science & Engineering
   - Visual CGPA: 9.92 / 10.0 (Forged from original 9.24)
   - Watermark: TAMPERED GPA
   - Testing Outcome: Verifier detects cryptographic hash mismatch against blockchain!

4. 4_Fake_Unregistered_Degree_Vikrant_Verma.pdf
   - Status: COUNTERFEIT / UNREGISTERED
   - Student: Vikrant R. Verma (PRN20249999)
   - Degree: B.Tech Cyber Security & Digital Forensics
   - CGPA: 9.75 / 10.0
   - Watermark: COUNTERFEIT DEGREE
   - Testing Outcome: Verifier flags batch as non-existent in university registry!

5. 5_Revoked_Degree_Pooja_Patil.pdf
   - Status: REVOKED BY EXAM AUTHORITY
   - Student: Pooja Patil (PRN20200104)
   - Degree: B.Tech Electronics & Computer Engineering
   - Watermark: REVOKED
   - Testing Outcome: Registry flags dynamic revocation bitmap bit as revoked!

WEB ACCESSIBILITY:
All PDFs are also accessible in your browser at:
http://localhost:3000/certificates_pdf/<filename>
========================================================================
`;
  fs.writeFileSync(path.join(outputDirRoot, 'README.txt'), summaryContent, 'utf8');
  fs.writeFileSync(path.join(outputDirPublic, 'README.txt'), summaryContent, 'utf8');

  console.log('--- ALL CERTIFICATES SUCCESSFULLY GENERATED ---');
}

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
