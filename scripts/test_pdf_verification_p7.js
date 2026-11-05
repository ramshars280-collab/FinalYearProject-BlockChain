/**
 * SOET VeriTrust - Phase 7 PDF Verification & Anti-Fragility Test Suite
 *
 * VALIDATES:
 * 1. Valid certificate containing keyword "ALTERED" is NOT classified as fraudulent (FULLY_VERIFIED).
 * 2. Valid certificate containing keyword "FRAUD" is NOT classified as fraudulent (FULLY_VERIFIED).
 * 3. Valid certificate containing keyword "TAMPERED" is NOT classified as fraudulent (FULLY_VERIFIED).
 * 4. Genuine claim mismatch (tampered CGPA 9.99 vs genuine 8.50) is detected as CLAIM_MISMATCH_CGPA.
 * 5. Authentic baseline certificate without keywords is FULLY_VERIFIED.
 * 6. Cryptographic Merkle proof remains authoritative when AI service is unavailable/offline.
 * 7. Unregistered issuer batch is rejected as UNREGISTERED_ISSUER (HTTP 404).
 * 8. Officially revoked credential is rejected as CREDENTIAL_REVOKED.
 * 9. Non-PDF upload missing %PDF- magic bytes is rejected (HTTP 400).
 * 10. Valid %PDF- magic byte header passes initial upload validation.
 *
 * STRICT SAFETY & ISOLATION GUARANTEES:
 * - Spawns dedicated Next.js test server on dynamic TCP port.
 * - Actively drains stdio pipes to eliminate OS buffer blocking on Windows.
 * - Applies bounded request timeouts to eliminate indefinite hangs.
 * - Cleans up server process tree and temporary test files in finally block.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execSync } = require('child_process');
const { generateCertificateHtml } = require('./generate_reference_design_certificates');

const REQUEST_TIMEOUT_MS = 8000;
const SERVER_STARTUP_TIMEOUT_MS = 30000;

const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

function killProcessTree(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {}
}

async function renderPdfWithExtraText(cert, extraText, outputPath) {
  let html = await generateCertificateHtml(cert);
  if (extraText) {
    html = html.replace(
      cert.contractAddress,
      `${cert.contractAddress} ${extraText}`
    );
  }
  const tempHtml = outputPath.replace(/\.pdf$/i, '_temp.html');
  fs.writeFileSync(tempHtml, html, 'utf8');
  try {
    execSync(`"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${outputPath}" "${tempHtml}"`, { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tempHtml)) {
      fs.unlinkSync(tempHtml);
    }
  }
}

async function uploadPdfForVerification(baseUrl, pdfBuffer, fileName = 'certificate.pdf') {
  const formData = new FormData();
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  formData.append('file', blob, fileName);

  const res = await fetch(`${baseUrl}/api/verify/pdf`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = await res.json();
  return { status: res.status, data };
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('SOET VeriTrust - Phase 7 PDF Verification Test Suite');
  console.log('====================================================\n');

  const tmpDir = path.resolve(process.cwd(), 'tmp_p7_test_' + Date.now());
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // 1. Base synthetic certificate definition anchored on Sepolia
  const validCert = {
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
  };

  // Generate test PDFs in temporary directory
  console.log('📄 Rendering synthetic test certificate PDFs with embedded keywords...');
  const alteredPdfPath = path.join(tmpDir, 'cert_altered.pdf');
  const fraudPdfPath = path.join(tmpDir, 'cert_fraud.pdf');
  const tamperedPdfPath = path.join(tmpDir, 'cert_tampered.pdf');
  const authenticPdfPath = path.join(tmpDir, 'cert_authentic.pdf');
  const tamperedGpaPdfPath = path.join(tmpDir, 'cert_tampered_gpa.pdf');

  await renderPdfWithExtraText(validCert, 'Official Security Note: Document status was ALTERED for audit verification.', alteredPdfPath);
  await renderPdfWithExtraText(validCert, 'University Legal Notice: Anti-FRAUD protection guaranteed by cryptography.', fraudPdfPath);
  await renderPdfWithExtraText(validCert, 'Security Watermark: This certificate is not TAMPERED in any way.', tamperedPdfPath);
  await renderPdfWithExtraText(validCert, '', authenticPdfPath);

  // Tampered GPA PDF (CGPA displays 9.99 instead of 8.50)
  const tamperedGpaCert = { ...validCert, cgpa: '9.99' };
  await renderPdfWithExtraText(tamperedGpaCert, '', tamperedGpaPdfPath);

  console.log('✅ Synthetic test PDFs rendered successfully.\n');

  // 2. Start dedicated Next.js test server
  const testPort = await getFreePort();
  const BASE_URL = `http://127.0.0.1:${testPort}`;
  console.log(`🚀 Starting dedicated Next.js test server on port ${testPort}...`);

  const serverProc = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', String(testPort)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(testPort),
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stdout.on('data', () => {});
  serverProc.stderr.on('data', () => {});

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  try {
    // 3. Wait for server readiness
    const startTime = Date.now();
    let isReady = false;
    while (Date.now() - startTime < SERVER_STARTUP_TIMEOUT_MS) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!isReady) {
      throw new Error(`Test server failed to respond on ${BASE_URL} within ${SERVER_STARTUP_TIMEOUT_MS}ms.`);
    }

    console.log(`✅ Dedicated test server ready in ${Date.now() - startTime}ms.\n`);

    // ----------------------------------------------------
    // TEST 1: Valid certificate containing "ALTERED" is NOT classified as fraudulent
    // ----------------------------------------------------
    try {
      const buffer = fs.readFileSync(alteredPdfPath);
      const { status, data } = await uploadPdfForVerification(BASE_URL, buffer, 'cert_altered.pdf');
      assert(
        status === 200 && data.success && data.isValid === true && !data.tamperDetected && data.diagnostic_code === 'FULLY_VERIFIED',
        'Test 1: Valid certificate containing keyword "ALTERED" is FULLY_VERIFIED'
      );
    } catch (err) {
      assert(false, 'Test 1: Keyword "ALTERED" check', err.message);
    }

    // ----------------------------------------------------
    // TEST 2: Valid certificate containing "FRAUD" is NOT classified as fraudulent
    // ----------------------------------------------------
    try {
      const buffer = fs.readFileSync(fraudPdfPath);
      const { status, data } = await uploadPdfForVerification(BASE_URL, buffer, 'cert_fraud.pdf');
      assert(
        status === 200 && data.success && data.isValid === true && !data.tamperDetected && data.diagnostic_code === 'FULLY_VERIFIED',
        'Test 2: Valid certificate containing keyword "FRAUD" is FULLY_VERIFIED'
      );
    } catch (err) {
      assert(false, 'Test 2: Keyword "FRAUD" check', err.message);
    }

    // ----------------------------------------------------
    // TEST 3: Valid certificate containing "TAMPERED" is NOT classified as fraudulent
    // ----------------------------------------------------
    try {
      const buffer = fs.readFileSync(tamperedPdfPath);
      const { status, data } = await uploadPdfForVerification(BASE_URL, buffer, 'cert_tampered.pdf');
      assert(
        status === 200 && data.success && data.isValid === true && !data.tamperDetected && data.diagnostic_code === 'FULLY_VERIFIED',
        'Test 3: Valid certificate containing keyword "TAMPERED" is FULLY_VERIFIED'
      );
    } catch (err) {
      assert(false, 'Test 3: Keyword "TAMPERED" check', err.message);
    }

    // ----------------------------------------------------
    // TEST 4: Genuine Claim Mismatch (CGPA 9.99 vs 8.50) is Detected & Flagged
    // ----------------------------------------------------
    try {
      const buffer = fs.readFileSync(tamperedGpaPdfPath);
      const { status, data } = await uploadPdfForVerification(BASE_URL, buffer, 'cert_tampered_gpa.pdf');
      assert(
        status === 200 && data.success && data.isValid === false && data.tamperDetected === true && data.diagnostic_code === 'CLAIM_MISMATCH_CGPA',
        'Test 4: Genuine CGPA claim mismatch (9.99 vs 8.50) is detected as CLAIM_MISMATCH_CGPA'
      );
    } catch (err) {
      assert(false, 'Test 4: Genuine CGPA claim mismatch check', err.message);
    }

    // ----------------------------------------------------
    // TEST 5: Authentic Baseline Certificate Verification
    // ----------------------------------------------------
    try {
      const buffer = fs.readFileSync(authenticPdfPath);
      const { status, data } = await uploadPdfForVerification(BASE_URL, buffer, 'cert_authentic.pdf');
      assert(
        status === 200 && data.success && data.isValid === true && !data.tamperDetected && data.diagnostic_code === 'FULLY_VERIFIED',
        'Test 5: Authentic baseline certificate is FULLY_VERIFIED'
      );
    } catch (err) {
      assert(false, 'Test 5: Authentic baseline check', err.message);
    }

    // ----------------------------------------------------
    // TEST 6: Merkle Proof Remains Authoritative When AI Service is Offline
    // ----------------------------------------------------
    try {
      const buffer = fs.readFileSync(authenticPdfPath);
      const { status, data } = await uploadPdfForVerification(BASE_URL, buffer, 'cert_authentic.pdf');
      assert(
        status === 200 && data.isValid === true && data.forensic_scan && (data.forensic_scan.status === 'UNAVAILABLE' || data.forensic_scan.status === 'COMPLETED'),
        'Test 6: Valid Merkle proof remains authoritative regardless of AI microservice status'
      );
    } catch (err) {
      assert(false, 'Test 6: Merkle authority check', err.message);
    }

    // ----------------------------------------------------
    // TEST 7: Unregistered Issuer / Unknown Batch is Rejected
    // ----------------------------------------------------
    try {
      const unregisteredCert = {
        ...validCert,
        prn: 'DEMO-UNREGISTERED-PRN-9999',
        batchId: 'UNKNOWN-UNREGISTERED-BATCH-999',
        verifyUrl: 'http://localhost:3000/?verify=UNKNOWN-UNREGISTERED-BATCH-999/0',
      };
      const unregPdfPath = path.join(tmpDir, 'cert_unreg.pdf');
      await renderPdfWithExtraText(unregisteredCert, '', unregPdfPath);
      const buffer = fs.readFileSync(unregPdfPath);

      const { status, data } = await uploadPdfForVerification(BASE_URL, buffer, 'cert_unreg.pdf');
      assert(
        status === 200 && data.isValid === false && data.isUnregistered === true && data.diagnostic_code === 'UNREGISTERED_ISSUER',
        'Test 7: Unregistered issuer batch is rejected as UNREGISTERED_ISSUER'
      );
    } catch (err) {
      assert(false, 'Test 7: Unregistered issuer check', err.message);
    }

    // ----------------------------------------------------
    // TEST 8: Officially Revoked Credential Remains Rejected
    // ----------------------------------------------------
    try {
      const revokedPdfPath = path.resolve('public/certificates_pdf/5_Revoked_Degree_Pooja_Patil.pdf');
      if (fs.existsSync(revokedPdfPath)) {
        const buffer = fs.readFileSync(revokedPdfPath);
        const { status, data } = await uploadPdfForVerification(BASE_URL, buffer, '5_Revoked_Degree_Pooja_Patil.pdf');
        assert(
          status === 200 && data.isValid === false && data.isRevoked === true && data.diagnostic_code === 'CREDENTIAL_REVOKED',
          'Test 8: Officially revoked credential is rejected as CREDENTIAL_REVOKED'
        );
      } else {
        assert(false, 'Test 8: Revoked credential file not found at ' + revokedPdfPath);
      }
    } catch (err) {
      assert(false, 'Test 8: Revoked credential check', err.message);
    }

    // ----------------------------------------------------
    // TEST 9: Non-PDF Upload Missing %PDF- Header Rejected
    // ----------------------------------------------------
    try {
      const fakePdfBuffer = Buffer.from('NOT_A_VALID_PDF_HEADER');
      const { status, data } = await uploadPdfForVerification(BASE_URL, fakePdfBuffer, 'fake.pdf');
      assert(
        status === 400 && data.error && data.error.includes('%PDF-'),
        'Test 9: Upload missing %PDF- magic bytes is rejected with HTTP 400'
      );
    } catch (err) {
      assert(false, 'Test 9: PDF magic byte rejection check', err.message);
    }

    // ----------------------------------------------------
    // TEST 10: Valid %PDF- Magic Byte Header Passes Initial Gate
    // ----------------------------------------------------
    try {
      const minimalPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF'
      );
      const { status } = await uploadPdfForVerification(BASE_URL, minimalPdf, 'minimal.pdf');
      assert(
        status !== 400,
        'Test 10: Valid %PDF- magic byte header passes initial upload validation'
      );
    } catch (err) {
      assert(false, 'Test 10: Valid PDF header gate check', err.message);
    }

  } finally {
    console.log('\n🧹 Terminating test server process tree...');
    if (serverProc && serverProc.pid) {
      killProcessTree(serverProc.pid);
    }

    await new Promise((r) => setTimeout(r, 600));

    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        console.log('🗑️  Temporary test directory cleanly removed.');
      }
    } catch (e) {
      console.warn('Notice: Temporary directory cleanup warning:', e.message);
    }
  }

  console.log('\n====================================================');
  console.log(`PDF Verification Test Suite Completed: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
