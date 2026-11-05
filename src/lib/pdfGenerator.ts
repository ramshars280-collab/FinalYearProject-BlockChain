import QRCode from 'qrcode';

export interface DynamicCertificatePdfData {
  studentName: string;
  prn: string;
  degree: string;
  branch?: string;
  cgpa?: number | string;
  graduationYear?: number | string;
  issueDate?: string;
  certNumber?: string;
  universityName?: string;
  instituteName?: string;
  division?: string;
  batchId: string;
  leafIndex: number;
  merkleRoot: string;
  contractAddress?: string;
  verifyUrl: string;
  isRevoked?: boolean;
  isDemo?: boolean;
}

/**
 * Escapes characters for standard PDF literal text strings.
 */
function escapePdfText(text: string | number | undefined | null): string {
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Generates an authoritative, vector-based, searchable A4 landscape PDF certificate.
 * Pure TypeScript execution without headless browser or external service dependencies.
 * Produces valid PDF 1.4 output with selectable text and vector QR code.
 */
export async function generateCertificatePdf(cert: DynamicCertificatePdfData): Promise<Buffer> {
  // A4 Landscape dimensions in points (72 points/inch)
  const W = 841.89;
  const H = 595.28;

  let stream = '';

  // 1. Background Fill (Cream #fdfbf7)
  stream += '0.992 0.984 0.969 rg\n';
  stream += `0 0 ${W} ${H} re f\n`;

  // 2. Outer Border (Restrained Gold #c5a059)
  stream += '0.773 0.627 0.349 RG\n';
  stream += '2.5 w\n';
  stream += `24 24 ${W - 48} ${H - 48} re S\n`;

  // 3. Inner Border (Fine Gold Line)
  stream += '0.773 0.627 0.349 RG\n';
  stream += '0.8 w\n';
  stream += `30 30 ${W - 60} ${H - 60} re S\n`;

  // Corner Accents (Decorative corner squares)
  const cornerSize = 10;
  stream += `${32} ${H - 32 - cornerSize} ${cornerSize} ${cornerSize} re f\n`;
  stream += `${W - 32 - cornerSize} ${H - 32 - cornerSize} ${cornerSize} ${cornerSize} re f\n`;
  stream += `${32} ${32} ${cornerSize} ${cornerSize} re f\n`;
  stream += `${W - 32 - cornerSize} ${32} ${cornerSize} ${cornerSize} re f\n`;

  // 4. University Header (Approved Institutional Identity: MGM University)
  const uniName = cert.universityName || 'MGM University';
  stream += 'BT\n';
  stream += '/F2 16 Tf\n'; // Helvetica-Bold
  stream += '0.12 0.16 0.24 rg\n';
  stream += `1 0 0 1 120 520 Tm\n`;
  stream += `(${escapePdfText(uniName)}) Tj\n`;
  stream += 'ET\n';

  // 5. Institution Sub-Header (Approved Identity: School of Engineering & Technology (SOET))
  const instName = cert.instituteName || 'School of Engineering & Technology (SOET)';
  stream += 'BT\n';
  stream += '/F1 10.5 Tf\n'; // Helvetica
  stream += '0.40 0.45 0.52 rg\n';
  stream += `1 0 0 1 120 502 Tm\n`;
  stream += `(${escapePdfText(instName)}) Tj\n`;
  stream += 'ET\n';

  // 6. Title: GRADUATION CERTIFICATE
  stream += 'BT\n';
  stream += '/F2 26 Tf\n';
  stream += '0.08 0.12 0.22 rg\n';
  stream += `1 0 0 1 120 445 Tm\n`;
  stream += '(GRADUATION CERTIFICATE) Tj\n';
  stream += 'ET\n';

  // Decorative Accent Line below Title
  stream += '0.773 0.627 0.349 RG\n1.5 w\n';
  stream += `120 432 180 0 re S\n`;

  // 7. Award Statement
  stream += 'BT\n';
  stream += '/F1 11 Tf\n';
  stream += '0.45 0.45 0.45 rg\n';
  stream += `1 0 0 1 120 405 Tm\n`;
  stream += '(This is to certify that the academic degree has been conferred upon) Tj\n';
  stream += 'ET\n';

  // 8. Student Recipient Name (Prominent)
  const studentName = (cert.studentName || 'Student Name').toUpperCase();
  stream += 'BT\n';
  stream += '/F2 22 Tf\n';
  stream += '0.06 0.10 0.20 rg\n';
  stream += `1 0 0 1 120 365 Tm\n`;
  stream += `(${escapePdfText(studentName)}) Tj\n`;
  stream += 'ET\n';

  // 9. Degree & Department Statement
  const degreeText = cert.degree || 'Bachelor of Technology';
  stream += 'BT\n';
  stream += '/F1 12 Tf\n';
  stream += '0.20 0.20 0.20 rg\n';
  stream += `1 0 0 1 120 332 Tm\n`;
  stream += `(for successfully completing the degree of ${escapePdfText(degreeText)}) Tj\n`;
  stream += 'ET\n';

  let qualificationDetails = '';
  if (cert.branch) {
    qualificationDetails += `in ${cert.branch}`;
  }
  if (cert.cgpa !== undefined && cert.cgpa !== null && String(cert.cgpa).trim() !== '') {
    qualificationDetails += `${qualificationDetails ? ' ' : ''}with Cumulative CGPA ${cert.cgpa} / 10.0`;
  }
  if (cert.division) {
    qualificationDetails += ` (${cert.division})`;
  }

  if (qualificationDetails) {
    stream += 'BT\n';
    stream += '/F1 11 Tf\n';
    stream += '0.30 0.30 0.30 rg\n';
    stream += `1 0 0 1 120 312 Tm\n`;
    stream += `(${escapePdfText(qualificationDetails)}) Tj\n`;
    stream += 'ET\n';
  }

  // 10. Watermark Handling
  if (cert.isRevoked) {
    // Revoked Watermark in Alert Crimson Red
    stream += 'q\n';
    stream += '0.85 0.20 0.20 rg\n';
    stream += '0.707 0.707 -0.707 0.707 330 180 cm\n';
    stream += 'BT\n';
    stream += '/F2 36 Tf\n';
    stream += '(REVOKED CREDENTIAL - INVALID) Tj\n';
    stream += 'ET\n';
    stream += 'Q\n';
  } else if (cert.isDemo) {
    // Demonstration Watermark in Muted Grey
    stream += 'q\n';
    stream += '0.88 0.88 0.88 rg\n';
    stream += '0.707 0.707 -0.707 0.707 360 180 cm\n';
    stream += 'BT\n';
    stream += '/F2 40 Tf\n';
    stream += '(DEMONSTRATION COPY) Tj\n';
    stream += 'ET\n';
    stream += 'Q\n';
  }

  // 11. Lower Left Metadata: Certificate No, Issue Date, PRN
  const certNo = cert.certNumber || '46585956';
  const issueDate = cert.issueDate || '03.11.2026';
  const gradYear = cert.graduationYear ? ` (Class of ${cert.graduationYear})` : '';

  stream += 'BT\n';
  stream += '/F1 9 Tf\n';
  stream += '0.35 0.35 0.35 rg\n';
  stream += `1 0 0 1 60 120 Tm\n`;
  stream += `(Certificate No: ${escapePdfText(certNo)}) Tj\n`;
  stream += `1 0 0 1 60 105 Tm\n`;
  stream += `(Date of Issue: ${escapePdfText(issueDate)}${escapePdfText(gradYear)}) Tj\n`;
  stream += `1 0 0 1 60 90 Tm\n`;
  stream += `(Permanent Registration No: ${escapePdfText(cert.prn)}) Tj\n`;
  stream += 'ET\n';

  // 12. Signatory Representation (Restrained & Academic)
  stream += 'BT\n';
  stream += '/F2 9 Tf\n';
  stream += '0.20 0.25 0.35 rg\n';
  stream += `1 0 0 1 350 110 Tm\n`;
  stream += '(Examination Authority) Tj\n';
  stream += '/F1 8 Tf\n';
  stream += '0.45 0.45 0.45 rg\n';
  stream += `1 0 0 1 350 96 Tm\n`;
  stream += '(Controller of Examinations) Tj\n';
  stream += 'ET\n';

  // Fine Line above Signatory
  stream += '0.80 0.80 0.80 RG\n0.8 w\n';
  stream += `350 125 120 0 re S\n`;

  // 13. High-Resolution Vector QR Code Rendering
  const qr = QRCode.create(cert.verifyUrl, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const modCount = modules.size;
  const qrBoxSize = 85;
  const modSize = qrBoxSize / modCount;
  const qrX = W - 60 - qrBoxSize;
  const qrY = 70;

  // QR container background
  stream += '1 1 1 rg\n';
  stream += `${qrX - 4} ${qrY - 4} ${qrBoxSize + 8} ${qrBoxSize + 8} re f\n`;
  stream += '0.85 0.85 0.85 RG\n0.5 w\n';
  stream += `${qrX - 4} ${qrY - 4} ${qrBoxSize + 8} ${qrBoxSize + 8} re S\n`;

  // Draw QR dark modules
  stream += '0.08 0.12 0.20 rg\n';
  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      if (modules.get(r, c)) {
        const mx = qrX + c * modSize;
        const my = qrY + (modCount - 1 - r) * modSize;
        stream += `${mx.toFixed(2)} ${my.toFixed(2)} ${(modSize + 0.1).toFixed(2)} ${(modSize + 0.1).toFixed(2)} re f\n`;
      }
    }
  }

  // Label under QR
  stream += 'BT\n';
  stream += '/F1 7.5 Tf\n';
  stream += '0.35 0.35 0.35 rg\n';
  stream += `1 0 0 1 ${qrX + 8} ${qrY - 14} Tm\n`;
  stream += '(Scan to Verify Online) Tj\n';
  stream += 'ET\n';

  // 14. Academic Disclaimer in Footer
  if (cert.isDemo) {
    stream += 'BT\n';
    stream += '/F1 7.5 Tf\n';
    stream += '0.50 0.50 0.50 rg\n';
    stream += `1 0 0 1 160 50 Tm\n`;
    stream += '(Synthetic data for academic project demonstration. This is not an officially issued degree certificate.) Tj\n';
    stream += 'ET\n';
  }

  // 15. Verifier Provenance Layer (100% extractable by pdfjs-dist)
  const cgpaFormatted = cert.cgpa !== undefined && cert.cgpa !== null ? Number(cert.cgpa).toFixed(2) : '8.50';
  const provenanceText = `${uniName} | ${instName} | Batch ID: ${cert.batchId} Leaf: #${cert.leafIndex} PRN: ${cert.prn} CUMULATIVE CGPA ${cgpaFormatted} Degree of ${cert.degree} URL: ${cert.verifyUrl} Root: ${cert.merkleRoot} Sepolia: ${cert.contractAddress || ''}`;
  stream += 'BT\n';
  stream += '/F1 6 Tf\n';
  stream += '0.99 0.98 0.97 rg\n'; // Rendered in near-background tint
  stream += `1 0 0 1 50 35 Tm\n`;
  stream += `(${escapePdfText(provenanceText)}) Tj\n`;
  stream += 'ET\n';

  // Assembly of PDF 1.4 Object Structure
  const streamBytes = Buffer.from(stream, 'utf8');
  const streamLength = streamBytes.length;

  const objects: string[] = [];
  const addObj = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  addObj('<< /Type /Catalog /Pages 2 0 R >>');
  addObj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`);
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  addObj(`<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);

  const pdfHeader = '%PDF-1.4\n';
  let body = '';
  const xrefOffsets: number[] = [];

  let currentOffset = Buffer.byteLength(pdfHeader, 'utf8');

  for (let i = 0; i < objects.length; i++) {
    xrefOffsets.push(currentOffset);
    const objStr = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    body += objStr;
    currentOffset += Buffer.byteLength(objStr, 'utf8');
  }

  const startXref = currentOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of xrefOffsets) {
    xref += String(off).padStart(10, '0') + ' 00000 n \n';
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;

  return Buffer.concat([
    Buffer.from(pdfHeader, 'utf8'),
    Buffer.from(body, 'utf8'),
    Buffer.from(xref, 'utf8'),
    Buffer.from(trailer, 'utf8'),
  ]);
}

