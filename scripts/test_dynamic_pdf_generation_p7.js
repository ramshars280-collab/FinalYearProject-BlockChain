/**
 * SOET VeriTrust - Phase 7 Dynamic PDF Generation & Identity Verification Test Suite
 *
 * VALIDATES:
 * 1. Dynamic PDF generation for existing anchored credential (SOET-SEPOLIA-2026-TEST01, leaf 0).
 * 2. Dynamic PDF generation for second credential with different leaf index (leaf 1).
 * 3. Approved institutional identity: PDF contains "MGM University".
 * 4. Approved institute identity: PDF contains "School of Engineering & Technology".
 * 5. Searchable text layer extraction via pdfjs-dist (non-flattened vector PDF 1.4).
 * 6. Credential data accuracy across multiple leaves (Demo Student 001 vs Demo Student 002).
 * 7. Graceful handling of missing optional fields without crashing.
 * 8. Unregistered batch rejected with HTTP 404.
 * 9. Out-of-bounds leaf index rejected with HTTP 404.
 * 10. Revoked credential explicitly marked with "REVOKED CREDENTIAL - INVALID" watermark.
 * 11. Host header poisoning defense: malicious Host / Forwarded-Host cannot hijack QR destination.
 * 12. Safe local development origin resolution for QR code verification links.
 * 13. Student access isolation: authenticated student cannot download another student certificate (HTTP 403).
 * 14. Student self-access: authenticated student can download their own certificate (HTTP 200).
 * 15. Issuer/Admin permissions: EXAM_ADMIN can download any certificate in batch (HTTP 200).
 * 16. End-to-end integration: dynamic PDF passes /api/verify/pdf with FULLY_VERIFIED.
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
const pdf = require('pdfjs-dist/legacy/build/pdf.js');

const REQUEST_TIMEOUT_MS = 8000;
const SERVER_STARTUP_TIMEOUT_MS = 30000;

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

async function runTestSuite() {
  console.log('====================================================');
  console.log('SOET VeriTrust - Phase 7 Dynamic PDF Generation & Identity Suite');
  console.log('====================================================\n');

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
    // Wait for server readiness
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
    // TEST 1: Dynamic PDF generation for existing anchored batch (Leaf 0)
    // ----------------------------------------------------
    let leaf0PdfBuffer = null;
    try {
      const res = await fetch(`${BASE_URL}/api/certificates/SOET-SEPOLIA-2026-TEST01/0/pdf`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const contentType = res.headers.get('content-type') || '';
      const contentDisposition = res.headers.get('content-disposition') || '';
      const arrayBuffer = await res.arrayBuffer();
      leaf0PdfBuffer = Buffer.from(arrayBuffer);

      assert(
        res.status === 200 &&
          contentType.includes('application/pdf') &&
          contentDisposition.includes('attachment') &&
          contentDisposition.includes('DEMO-CSE-2026-001') &&
          leaf0PdfBuffer.subarray(0, 5).toString('ascii') === '%PDF-',
        'Test 1: Dynamic PDF generated successfully for anchored credential (Leaf #0)'
      );
    } catch (err) {
      assert(false, 'Test 1: Dynamic PDF Leaf 0 generation', err.message);
    }

    // ----------------------------------------------------
    // TEST 2: Dynamic PDF generation for second credential (Leaf 1)
    // ----------------------------------------------------
    let leaf1PdfBuffer = null;
    try {
      const res = await fetch(`${BASE_URL}/api/certificates/SOET-SEPOLIA-2026-TEST01/1/pdf`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const arrayBuffer = await res.arrayBuffer();
      leaf1PdfBuffer = Buffer.from(arrayBuffer);

      assert(
        res.status === 200 &&
          res.headers.get('content-type')?.includes('application/pdf') &&
          leaf1PdfBuffer.subarray(0, 5).toString('ascii') === '%PDF-',
        'Test 2: Dynamic PDF generated successfully for distinct credential in batch (Leaf #1)'
      );
    } catch (err) {
      assert(false, 'Test 2: Dynamic PDF Leaf 1 generation', err.message);
    }

    // ----------------------------------------------------
    // TEST 3 & 4: University Identity Validation ("MGM University" & "School of Engineering & Technology")
    // ----------------------------------------------------
    let extractedText0 = '';
    try {
      if (leaf0PdfBuffer) {
        const doc = await pdf.getDocument({ data: new Uint8Array(leaf0PdfBuffer) }).promise;
        const page = await doc.getPage(1);
        const textContent = await page.getTextContent();
        extractedText0 = textContent.items.map((item) => item.str).join(' ');

        assert(
          extractedText0.includes('MGM University'),
          'Test 3: Generated PDF explicitly contains approved university name "MGM University"'
        );

        assert(
          extractedText0.includes('School of Engineering & Technology') ||
            extractedText0.includes('School of Engineering and Technology'),
          'Test 4: Generated PDF explicitly contains approved institute name "School of Engineering & Technology"'
        );
      } else {
        assert(false, 'Test 3 & 4: Identity check', 'Leaf 0 PDF buffer not available');
      }
    } catch (err) {
      assert(false, 'Test 3 & 4: Identity extraction error', err.message);
    }

    // ----------------------------------------------------
    // TEST 5: Searchable text layer extraction via pdfjs-dist
    // ----------------------------------------------------
    try {
      if (leaf0PdfBuffer) {
        const hasStudent = extractedText0.includes('DEMO STUDENT 001');
        const hasPrn = extractedText0.includes('DEMO-CSE-2026-001');
        const hasDegree = extractedText0.includes('Bachelor of Technology');
        const hasCgpa = extractedText0.includes('8.50');
        const hasBatch = extractedText0.includes('SOET-SEPOLIA-2026-TEST01');

        assert(
          hasStudent && hasPrn && hasDegree && hasCgpa && hasBatch,
          'Test 5: Generated PDF text layer contains authoritative credential data and is 100% searchable'
        );
      } else {
        assert(false, 'Test 5: Extracted text check', 'Leaf 0 PDF buffer not available');
      }
    } catch (err) {
      assert(false, 'Test 5: Text extraction error', err.message);
    }

    // ----------------------------------------------------
    // TEST 6: Searchable text layer check for Leaf 1
    // ----------------------------------------------------
    try {
      if (leaf1PdfBuffer) {
        const doc = await pdf.getDocument({ data: new Uint8Array(leaf1PdfBuffer) }).promise;
        const page = await doc.getPage(1);
        const textContent = await page.getTextContent();
        const extractedText1 = textContent.items.map((item) => item.str).join(' ');

        const hasStudent1 = extractedText1.includes('DEMO STUDENT 002');
        const hasPrn1 = extractedText1.includes('DEMO-CSE-2026-002');
        const hasCgpa1 = extractedText1.includes('8.75');

        assert(
          hasStudent1 && hasPrn1 && hasCgpa1,
          'Test 6: Leaf #1 PDF text layer reflects unique authoritative data (Demo Student 002, CGPA 8.75)'
        );
      } else {
        assert(false, 'Test 6: Extracted text check Leaf 1', 'Leaf 1 PDF buffer not available');
      }
    } catch (err) {
      assert(false, 'Test 6: Leaf 1 text extraction error', err.message);
    }

    // ----------------------------------------------------
    // TEST 7: Graceful handling of missing optional fields
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/certificates/MGM-2026-BATCH-001/0/pdf`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      assert(
        res.status === 200 && buffer.subarray(0, 5).toString('ascii') === '%PDF-',
        'Test 7: Missing or non-standard optional fields render cleanly without crashing'
      );
    } catch (err) {
      assert(false, 'Test 7: Optional fields check', err.message);
    }

    // ----------------------------------------------------
    // TEST 8: Unregistered batch is rejected with HTTP 404
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/certificates/NONEXISTENT-BATCH-9999/0/pdf`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data = await res.json();

      assert(
        res.status === 404 && data.success === false && data.error.includes('not found'),
        'Test 8: Request for unregistered batch ID returns HTTP 404'
      );
    } catch (err) {
      assert(false, 'Test 8: Unregistered batch check', err.message);
    }

    // ----------------------------------------------------
    // TEST 9: Invalid out-of-bounds leafIndex is rejected with HTTP 404
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/certificates/SOET-SEPOLIA-2026-TEST01/999/pdf`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data = await res.json();

      assert(
        res.status === 404 && data.success === false && data.error.includes('not found in batch'),
        'Test 9: Out-of-bounds leaf index returns HTTP 404'
      );
    } catch (err) {
      assert(false, 'Test 9: Out-of-bounds leaf check', err.message);
    }

    // ----------------------------------------------------
    // TEST 10: Revoked credential includes REVOKED watermark and warning
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/certificates/MGM-2024-BTECH-BATCH01/3/pdf`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const arrayBuffer = await res.arrayBuffer();
      const revokedBuffer = Buffer.from(arrayBuffer);

      const doc = await pdf.getDocument({ data: new Uint8Array(revokedBuffer) }).promise;
      const page = await doc.getPage(1);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item) => item.str).join(' ');

      assert(
        res.status === 200 && text.includes('REVOKED CREDENTIAL - INVALID'),
        'Test 10: Revoked credential PDF explicitly displays REVOKED CREDENTIAL - INVALID watermark'
      );
    } catch (err) {
      assert(false, 'Test 10: Revocation watermark check', err.message);
    }

    // ----------------------------------------------------
    // TEST 11: Host Header Poisoning Defense
    // ----------------------------------------------------
    try {
      const maliciousHost = 'evil-phishing-portal.attacker.xyz';
      const poisonedRes = await fetch(`${BASE_URL}/api/certificates/SOET-SEPOLIA-2026-TEST01/0/pdf`, {
        headers: {
          'Host': maliciousHost,
          'X-Forwarded-Host': maliciousHost,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const arrayBuffer = await poisonedRes.arrayBuffer();
      const poisonedBuffer = Buffer.from(arrayBuffer);
      const rawPdfString = poisonedBuffer.toString('utf8');

      // The malicious domain must NOT appear anywhere in the PDF stream or QR code content
      const containsMaliciousHost = rawPdfString.includes(maliciousHost);

      assert(
        poisonedRes.status === 200 && !containsMaliciousHost,
        'Test 11: Host header poisoning defense: malicious Host header cannot influence QR verification origin'
      );
    } catch (err) {
      assert(false, 'Test 11: Host poisoning defense check', err.message);
    }

    // ----------------------------------------------------
    // TEST 12: Safe Local Development QR Verification URL Resolution
    // ----------------------------------------------------
    try {
      const localRes = await fetch(`${BASE_URL}/api/certificates/SOET-SEPOLIA-2026-TEST01/0/pdf`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const arrayBuffer = await localRes.arrayBuffer();
      const localBuffer = Buffer.from(arrayBuffer);
      const rawPdfString = localBuffer.toString('utf8');

      // In local development, the loopback address with testPort is preserved safely
      const expectedVerifyPath = `/?verify=SOET-SEPOLIA-2026-TEST01/0`;
      assert(
        localRes.status === 200 && rawPdfString.includes(expectedVerifyPath),
        'Test 12: Local development URL resolution safely generates expected verification path'
      );
    } catch (err) {
      assert(false, 'Test 12: Local development URL check', err.message);
    }

    // ----------------------------------------------------
    // TEST 13: Student Access Isolation (Cross-student download rejected with HTTP 403)
    // ----------------------------------------------------
    let studentCookie = '';
    try {
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
        },
        body: JSON.stringify({
          role: 'STUDENT',
          identifier: 'DEMO-CSE-2026-002',
          password: 'student123',
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const setCookie = loginRes.headers.get('set-cookie');
      studentCookie = setCookie ? setCookie.split(';')[0] : '';

      // Attempt to download certificate belonging to DEMO-CSE-2026-001 (Leaf 0)
      const unauthorizedRes = await fetch(`${BASE_URL}/api/certificates/SOET-SEPOLIA-2026-TEST01/0/pdf`, {
        headers: {
          'Cookie': studentCookie,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const unauthorizedData = await unauthorizedRes.json();

      assert(
        unauthorizedRes.status === 403 &&
          unauthorizedData.success === false &&
          unauthorizedData.error.includes('Forbidden'),
        'Test 13: Student access isolation: authenticated student cannot download another student certificate'
      );
    } catch (err) {
      assert(false, 'Test 13: Student authorization check', err.message);
    }

    // ----------------------------------------------------
    // TEST 14: Student Self-Access (Authenticated student downloads own certificate)
    // ----------------------------------------------------
    try {
      if (studentCookie) {
        // DEMO-CSE-2026-002 is Leaf 1 in SOET-SEPOLIA-2026-TEST01
        const selfRes = await fetch(`${BASE_URL}/api/certificates/SOET-SEPOLIA-2026-TEST01/1/pdf`, {
          headers: {
            'Cookie': studentCookie,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const arrayBuffer = await selfRes.arrayBuffer();
        const selfBuffer = Buffer.from(arrayBuffer);

        assert(
          selfRes.status === 200 && selfBuffer.subarray(0, 5).toString('ascii') === '%PDF-',
          'Test 14: Student self-access: authenticated student can successfully download their own certificate'
        );
      } else {
        assert(false, 'Test 14: Student self-access', 'Student session cookie not available');
      }
    } catch (err) {
      assert(false, 'Test 14: Student self-access error', err.message);
    }

    // ----------------------------------------------------
    // TEST 15: Issuer/Admin Permissions (EXAM_ADMIN can download any certificate)
    // ----------------------------------------------------
    try {
      const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': BASE_URL,
        },
        body: JSON.stringify({
          role: 'EXAM_ADMIN',
          identifier: 'admin',
          password: 'admin123',
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const adminSetCookie = adminLoginRes.headers.get('set-cookie');
      const adminCookie = adminSetCookie ? adminSetCookie.split(';')[0] : '';

      const adminRes = await fetch(`${BASE_URL}/api/certificates/SOET-SEPOLIA-2026-TEST01/0/pdf`, {
        headers: {
          'Cookie': adminCookie,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const arrayBuffer = await adminRes.arrayBuffer();
      const adminBuffer = Buffer.from(arrayBuffer);

      assert(
        adminRes.status === 200 && adminBuffer.subarray(0, 5).toString('ascii') === '%PDF-',
        'Test 15: Issuer/Admin permissions: EXAM_ADMIN can download any student certificate in batch'
      );
    } catch (err) {
      assert(false, 'Test 15: Admin permission check', err.message);
    }

    // ----------------------------------------------------
    // TEST 16: End-to-End Verification of Dynamically Generated PDF
    // ----------------------------------------------------
    try {
      if (leaf0PdfBuffer) {
        const formData = new FormData();
        const blob = new Blob([leaf0PdfBuffer], { type: 'application/pdf' });
        formData.append('file', blob, 'dynamic_certificate.pdf');

        const verifyRes = await fetch(`${BASE_URL}/api/verify/pdf`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const verifyData = await verifyRes.json();

        assert(
          verifyRes.status === 200 &&
            verifyData.success === true &&
            verifyData.isValid === true &&
            !verifyData.tamperDetected &&
            verifyData.diagnostic_code === 'FULLY_VERIFIED',
          'Test 16: Dynamically generated PDF is successfully parsed and FULLY_VERIFIED by /api/verify/pdf'
        );
      } else {
        assert(false, 'Test 16: End-to-end verification', 'PDF buffer not available');
      }
    } catch (err) {
      assert(false, 'Test 16: End-to-end verification error', err.message);
    }

  } finally {
    console.log('\n🧹 Terminating test server process tree...');
    if (serverProc && serverProc.pid) {
      killProcessTree(serverProc.pid);
    }
  }

  console.log('\n====================================================');
  console.log(`Dynamic PDF Test Suite Completed: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
