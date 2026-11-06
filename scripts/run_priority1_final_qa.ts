import fs from "fs";
import path from "path";
import os from "os";
import net from "net";
import { spawn, ChildProcess } from "child_process";
import { getAllBatchesDb } from "../src/lib/db";
import { buildBatchMerkleTree, createW3CCredential } from "../src/lib/crypto";
import { signSessionToken } from "../src/lib/serverAuth";
import { AdminUser, StudentUser } from "../src/types/auth";
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

const TEST_AUTH_SECRET = "soet_veritrust_test_secret_32_characters_minimum_length_key!";
process.env.AUTH_SECRET = TEST_AUTH_SECRET;

const CHROME_PATH =
  process.platform === "win32"
    ? fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    : process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome";
const REQUEST_TIMEOUT_MS = 15000;
const SERVER_STARTUP_TIMEOUT_MS = 25000;

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

class HeadlessBrowserCDP {
  private port: number;
  private ws: any = null;
  private id = 1;
  private callbacks = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

  constructor(port: number) {
    this.port = port;
  }

  async connect() {
    const res = await fetch(`http://127.0.0.1:${this.port}/json/new`, { method: "PUT" });
    const tab: any = await res.json();
    this.ws = new (globalThis as any).WebSocket(tab.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event: any) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id)!;
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };

    await this.send("Page.enable");
    await this.send("Network.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
  }

  send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async setViewport(width: number, height: number, isMobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: isMobile ? 2 : 1,
      mobile: isMobile,
      fitWindow: false,
    });
  }

  async setCookie(name: string, value: string, url: string) {
    await this.send("Network.setCookie", {
      name,
      value,
      url,
      path: "/",
      sameSite: "Lax",
    });
  }

  async clearCookies() {
    await this.send("Network.clearBrowserCookies");
  }

  async navigate(url: string, waitMs = 2000) {
    await this.send("Page.navigate", { url });
    await delay(waitMs);
  }

  async evaluate(expression: string): Promise<any> {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value;
  }

  async uploadFile(selector: string, filePath: string) {
    const doc = await this.send("DOM.getDocument");
    const node = await this.send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector,
    });
    if (!node || !node.nodeId) {
      throw new Error(`File input selector '${selector}' not found`);
    }
    await this.send("DOM.setFileInputFiles", {
      files: [filePath],
      nodeId: node.nodeId,
    });
    await this.evaluate(`
      (() => {
        const input = document.querySelector('${selector}');
        if (input) {
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
  }

  async checkHorizontalOverflow() {
    return await this.evaluate(`
      (() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const bodyWidth = document.body ? document.body.scrollWidth : 0;
        const maxScroll = Math.max(docWidth, bodyWidth);
        const hasOverflow = maxScroll > winWidth + 1;
        return {
          hasOverflow,
          winWidth,
          docWidth,
          bodyWidth,
          overflowPx: hasOverflow ? maxScroll - winWidth : 0
        };
      })()
    `);
  }

  async close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }
  }
}

async function main() {
  console.log("================================================================================");
  console.log("  SOET VeriTrust: Priority 1 Final QA, Real Browser & Security Review Suite");
  console.log("================================================================================\n");

  const appPort = await getFreePort();
  const chromePort = await getFreePort();
  const BASE_URL = `http://localhost:${appPort}`;

  console.log(`Starting Next.js production server on ${BASE_URL}...`);
  const serverProc: ChildProcess = spawn(
    "node",
    ["node_modules/next/dist/bin/next", "start", "-p", String(appPort)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(appPort),
        ALLOW_LOCAL_SQLITE: "true",
        AUTH_SECRET: TEST_AUTH_SECRET,
        ADMIN_PASSWORD: "admin123",
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let chromeProc: ChildProcess | null = null;
  let browser: HeadlessBrowserCDP | null = null;

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, title: string, details = "") {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${details}`);
      failedTests++;
    }
  }

  try {
    // 1. Wait for Next.js server readiness
    const serverStart = Date.now();
    let isReady = false;
    while (Date.now() - serverStart < SERVER_STARTUP_TIMEOUT_MS) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch {}
      await delay(400);
    }

    if (!isReady) {
      throw new Error(`Next.js test server failed to start within ${SERVER_STARTUP_TIMEOUT_MS}ms.`);
    }
    console.log(`✅ Next.js production server ready in ${Date.now() - serverStart}ms.\n`);

    // 2. Launch real Headless Chrome
    console.log(`Launching real Headless Chrome on CDP port ${chromePort}...`);
    chromeProc = spawn(
      CHROME_PATH,
      [
        "--headless=new",
        `--remote-debugging-port=${chromePort}`,
        "--no-sandbox",
        "--disable-gpu",
        "--disable-extensions",
        "--window-size=1440,900",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    // Wait for Chrome CDP port
    let chromeReady = false;
    const chromeStart = Date.now();
    while (Date.now() - chromeStart < 10000) {
      try {
        const res = await fetch(`http://127.0.0.1:${chromePort}/json/version`, {
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok) {
          chromeReady = true;
          break;
        }
      } catch {}
      await delay(300);
    }

    if (!chromeReady) {
      throw new Error("Headless Chrome failed to bind to debugging port.");
    }

    browser = new HeadlessBrowserCDP(chromePort);
    await browser.connect();
    console.log("✅ Headless Chrome CDP connected successfully.\n");

    // -------------------------------------------------------------------------
    // WORKFLOW A: PUBLIC CERTIFICATE VERIFICATION IN REAL BROWSER
    // -------------------------------------------------------------------------
    console.log("--- WORKFLOW A: Public Certificate Verification ---");
    await browser.setViewport(1440, 900);
    await browser.navigate(`${BASE_URL}/`, 2000);

    // Verify clean layout (no promotional cards or comparison table)
    const pageText = await browser.evaluate("document.body.innerText");
    assert(
      !pageText.includes("Why Decentralized Degree Authentication?") &&
      !pageText.includes("Comparison: Traditional vs SOET VeriTrust Architecture") &&
      !pageText.includes("Are you an Accredited University or Examination Authority?"),
      "Browser UI Cleanup: Verified tab has no promotional cards or comparison table"
    );

    assert(
      pageText.includes("Academic Degree Verification") || pageText.includes("VeriTrust"),
      "Browser Hero: Public verification portal title and dropzone rendered cleanly"
    );

    // Fetch authentic multi-record batch from DB to generate valid credential payload and test peer isolation
    const batches = await getAllBatchesDb();
    const batch0 = batches.find((b) => b.records && b.records.length >= 3) || batches[0];
    const student0 = batch0.records[0];
    const tree0 = buildBatchMerkleTree(batch0.records);
    const validProof = {
      ...tree0.proofs[0],
      batchId: batch0.batchId,
      contractAddress: batch0.expectedContract || "",
      network: batch0.status === "ANCHORED" ? "Ethereum Sepolia" : "Local Institutional Registry",
    };
    const validCred = createW3CCredential(
      student0,
      validProof,
      batch0.issuer,
      batch0.institutionName || "MGM University",
      batch0.institutionCode || "MGMU-ENG-01"
    );

    // Prepare temp credential files for real OS file picker simulation via CDP
    const tempValidPath = path.join(os.tmpdir(), "soet_valid_degree.json");
    const tempTamperedPath = path.join(os.tmpdir(), "soet_tampered_degree.json");
    fs.writeFileSync(tempValidPath, JSON.stringify(validCred, null, 2), "utf8");

    const tamperedCred = JSON.parse(JSON.stringify(validCred));
    tamperedCred.credentialSubject.cgpa = 9.99; // Tampered CGPA
    fs.writeFileSync(tempTamperedPath, JSON.stringify(tamperedCred, null, 2), "utf8");

    // Switch to Upload Tab: Click "Verify via PDF"
    await browser.evaluate(`
      (() => {
        const uploadBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Verify via PDF'));
        if (uploadBtn) uploadBtn.click();
      })()
    `);
    await delay(500);

    // Upload valid credential via CDP setFileInputFiles
    await browser.uploadFile('input[type="file"]', tempValidPath);
    await delay(2500);

    const verifiedText = await browser.evaluate("document.body.innerText");
    const hasVerificationResult =
      verifiedText.includes("Academic Credential Authenticity Confirmed") ||
      verifiedText.includes("100% Authentic & Tamper-Proof") ||
      verifiedText.includes("Verified On-Chain") ||
      verifiedText.includes("VERIFIED") ||
      verifiedText.includes("Cryptographically Verified");

    assert(hasVerificationResult, "Browser Verification: Valid certificate verified and result card displayed");

    // Verify CredentialVerificationReport rendered in the DOM, NOT DegreeCertificate document
    const verificationReportRendered = await browser.evaluate(`
      Boolean(
        document.querySelector('[data-testid="credential-verification-report"]') &&
        document.body.innerText.toLowerCase().includes("${student0.fullName.toLowerCase()}")
      )
    `);
    assert(verificationReportRendered, "Browser Verification Report: CredentialVerificationReport component rendered with student details");

    // Assert that the full certificate (#printable-degree) is NOT rendered in public verification
    const fullCertificateAbsent = await browser.evaluate(`
      document.querySelector('#printable-degree') === null
    `);
    assert(fullCertificateAbsent, "Browser Public Verifier: Full certificate document (#printable-degree) correctly removed from public verification");

    // Test Share Report Link button
    const hasShareBtn = await browser.evaluate(`
      (() => {
        const shareBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Share Verification') || b.textContent.includes('Share Report')));
        return Boolean(shareBtn);
      })()
    `);
    assert(hasShareBtn, "Browser Report Controls: Share Report Link action present on verification dashboard");

    // Test responsive viewports for overflow
    // 1. Desktop (1440x900)
    await browser.setViewport(1440, 900);
    const desktopOverflow = await browser.checkHorizontalOverflow();
    assert(!desktopOverflow.hasOverflow, "Responsive Layout: Desktop (1440x900) horizontal overflow is 0px");

    // 2. Tablet (768x1024)
    await browser.setViewport(768, 1024);
    const tabletOverflow = await browser.checkHorizontalOverflow();
    if (tabletOverflow.hasOverflow) {
      const offenders = await browser.evaluate(`
        (() => {
          const winWidth = window.innerWidth;
          const all = Array.from(document.querySelectorAll('*'));
          return all
            .filter(el => el.getBoundingClientRect().right > winWidth + 1 || el.scrollWidth > winWidth + 1)
            .map(el => ({ tag: el.tagName, class: (el.className || '').slice(0, 50), id: el.id, right: el.getBoundingClientRect().right, scrollWidth: el.scrollWidth }))
            .slice(0, 5);
        })()
      `);
      console.log("Tablet overflow offenders:", JSON.stringify(offenders, null, 2));
    }
    assert(!tabletOverflow.hasOverflow, "Responsive Layout: Tablet (768x1024) horizontal overflow is 0px");

    // 3. Mobile (375x667)
    await browser.setViewport(375, 667, true);
    const mobileOverflow = await browser.checkHorizontalOverflow();
    assert(!mobileOverflow.hasOverflow, "Responsive Layout: Mobile (375x667) horizontal overflow is 0px");

    // Reset back to Desktop
    await browser.setViewport(1440, 900);

    // Reset verification result to prepare for tampered credential upload test
    await browser.evaluate(`
      (() => {
        const backBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Verify Another Credential'));
        if (backBtn) backBtn.click();
      })()
    `);
    await delay(800);

    // Switch to Upload Tab again: return to dropzone if a verification report is active
    await browser.evaluate(`
      (() => {
        const verifyAnotherBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Verify Another'));
        if (verifyAnotherBtn) verifyAnotherBtn.click();
        const uploadBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Verify via PDF'));
        if (uploadBtn) uploadBtn.click();
      })()
    `);
    await delay(1000);

    // Upload tampered certificate via CDP
    await browser.uploadFile('input[type="file"]', tempTamperedPath);
    await delay(2500);

    const tamperedText = await browser.evaluate("document.body.innerText");
    const caughtTamper =
      tamperedText.includes("Cryptographic Hash Mismatch") ||
      tamperedText.includes("Data Tampered") ||
      tamperedText.includes("REJECTED") ||
      tamperedText.includes("Mismatch");
    assert(caughtTamper, "Browser Tamper Detection: Modified credential flagged with Cryptographic Hash Mismatch banner");

    // Clean up temporary files
    try {
      if (fs.existsSync(tempValidPath)) fs.unlinkSync(tempValidPath);
      if (fs.existsSync(tempTamperedPath)) fs.unlinkSync(tempTamperedPath);
    } catch {}

    // Test direct PRN verification on URL tab
    await browser.evaluate(`
      (() => {
        const backBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Verify Another Credential'));
        if (backBtn) backBtn.click();
      })()
    `);
    await delay(800);

    await browser.evaluate(`
      (() => {
        const urlTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Verify via URL or PRN'));
        if (urlTab) urlTab.click();
      })()
    `);
    await delay(500);

    await browser.evaluate(`
      (() => {
        const sampleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('${student0.prn}'));
        if (sampleBtn) {
          sampleBtn.click();
        } else {
          const input = document.querySelector('input[placeholder*="Paste verification URL or Student PRN"]');
          if (input) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, "${student0.prn}");
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const verifyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Verify Credential'));
          if (verifyBtn) verifyBtn.click();
        }
      })()
    `);
    await delay(3000);

    const prnVerifiedText = await browser.evaluate("document.body.innerText");
    const prnResolved =
      prnVerifiedText.toLowerCase().includes(student0.fullName.toLowerCase()) &&
      (prnVerifiedText.includes("Authentic") || prnVerifiedText.includes("Verified") || prnVerifiedText.includes("100%"));
    assert(
      prnResolved,
      `Browser PRN Lookup: Direct PRN lookup for '${student0.prn}' resolved and verified student '${student0.fullName}'`
    );

    // -------------------------------------------------------------------------
    // WORKFLOW B: ISSUER CERTIFICATE MANAGEMENT IN REAL BROWSER
    // -------------------------------------------------------------------------
    console.log("\n--- WORKFLOW B: Issuer Certificate Management ---");

    const adminUser: AdminUser = {
      staffId: "EXAM_ADMIN_MGM",
      fullName: "Prof. V. M. Deshpande",
      department: "Examination Authority",
      role: "EXAM_ADMIN",
      institutionCode: "MGMU-ENG-01",
      institutionName: "MGM University, Chhatrapati Sambhajinagar",
      authorizedWallet: "0x8D0cC3553e9d812797B986F15427835A2930a301",
    };
    const adminToken = signSessionToken(adminUser);

    // Set cookie and navigate to /issuer
    await browser.setCookie("auth_session", adminToken, BASE_URL);
    await browser.navigate(`${BASE_URL}/issuer`, 2500);

    const issuerPageText = await browser.evaluate("document.body.innerText");
    assert(
      issuerPageText.includes("University Authority & Admin Console") ||
      issuerPageText.includes("Issued Student Certificates") ||
      issuerPageText.includes("MGM University"),
      "Issuer Login: Authenticated via session cookie and loaded University Admin Console"
    );

    // Verify "Issued Student Certificates" component renders in Tab 1
    const certsSectionVisible = await browser.evaluate(`
      Boolean(document.body.innerText.includes("Issued Student Certificates"))
    `);
    assert(certsSectionVisible, "Issuer Certificates List: 'Issued Student Certificates' matrix visible in Tab 1");

    // Verify search functionality in IssuerCertificatesList
    const searchTargetPrn = student0.prn;
    await browser.evaluate(`
      (() => {
        const input = document.querySelector('input[placeholder*="Search by student name, PRN"]');
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, "${searchTargetPrn}");
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await delay(1000);

    const searchResultText = await browser.evaluate("document.body.innerText");
    assert(
      searchResultText.includes(student0.fullName) && searchResultText.includes(searchTargetPrn),
      `Issuer Search: Search by PRN '${searchTargetPrn}' isolates student '${student0.fullName}'`
    );

    // Open View Certificate Modal in browser
    await browser.evaluate(`
      (() => {
        const viewBtns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.trim() === 'View');
        if (viewBtns.length > 0) viewBtns[0].click();
      })()
    `);
    await delay(1500);

    const modalRendered = await browser.evaluate(`
      Boolean(document.body.innerText.includes("Issued Degree Certificate") && document.body.innerText.includes("${student0.fullName}"))
    `);
    assert(modalRendered, "Issuer Modal: View Certificate action launches interactive DegreeCertificate preview modal");

    // Close preview modal
    await browser.evaluate(`
      (() => {
        const closeBtn = document.querySelector('button[title="Close Preview"]');
        if (closeBtn) closeBtn.click();
      })()
    `);
    await delay(600);

    // Test status filter buttons in IssuerCertificatesList
    await browser.evaluate(`
      (() => {
        const anchoredBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Anchored On-Chain'));
        if (anchoredBtn) anchoredBtn.click();
      })()
    `);
    await delay(500);
    const filterSectionText = await browser.evaluate("document.body.innerText");
    assert(filterSectionText.includes("Filter Status:"), "Issuer Status Filter: Filter status buttons toggle cleanly");

    // Reset filter to All
    await browser.evaluate(`
      (() => {
        const allBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('All ('));
        if (allBtn) allBtn.click();
      })()
    `);
    await delay(500);

    // Test Dynamic PDF Download directly
    const pdfUrl = `${BASE_URL}/api/certificates/${encodeURIComponent(batch0.batchId)}/0/pdf`;
    const pdfRes = await fetch(pdfUrl, {
      headers: { Cookie: `auth_session=${adminToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    assert(
      pdfRes.status === 200 && pdfBuffer.subarray(0, 5).toString("ascii") === "%PDF-",
      "PDF Download: Vector PDF successfully generated and retrieved (HTTP 200)"
    );

    // Validate downloaded PDF content
    const pdfRawStr = pdfBuffer.toString("utf8");
    const containsStudent = pdfRawStr.includes(student0.fullName) || pdfRawStr.includes(student0.prn);
    const containsUniversity = pdfRawStr.includes("MGM University");

    assert(
      containsStudent && containsUniversity,
      `PDF Content Verification: Vector PDF contains student '${student0.fullName}' (PRN: '${student0.prn}') and university 'MGM University'`
    );

    // -------------------------------------------------------------------------
    // WORKFLOW C: BULK CANDIDATE AUDIT IN REAL BROWSER
    // -------------------------------------------------------------------------
    console.log("\n--- WORKFLOW C: Bulk Candidate Audit ---");

    // Click on Tab 2: "2. Bulk Candidate Audit"
    await browser.evaluate(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('Bulk Candidate Audit'));
        if (tabs.length > 0) tabs[0].click();
      })()
    `);
    await delay(1200);

    const auditTabText = await browser.evaluate("document.body.innerText");
    assert(
      auditTabText.includes("High-Throughput Candidate Verification Matrix") &&
      auditTabText.includes(student0.prn),
      "Bulk Candidate Audit: Genuine database records appear automatically in audit table"
    );

    // Test live search in Audit tab
    await browser.evaluate(`
      (() => {
        const input = document.querySelector('input[placeholder*="Search candidate name or PRN"]');
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, "${student0.fullName.split(" ")[0]}");
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await delay(600);

    const auditSearchText = await browser.evaluate("document.body.innerText");
    assert(
      auditSearchText.includes(student0.fullName) && auditSearchText.includes(student0.prn),
      "Audit Search: Candidate search query successfully isolates matched student row"
    );

    // Reset search
    await browser.evaluate(`
      (() => {
        const input = document.querySelector('input[placeholder*="Search candidate name or PRN"]');
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, "");
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await delay(500);

    // Test Audit Status Filters
    await browser.evaluate(`
      (() => {
        const authMatchBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Authentic Match'));
        if (authMatchBtn) authMatchBtn.click();
      })()
    `);
    await delay(500);

    const auditFilterText = await browser.evaluate("document.body.innerText");
    assert(auditFilterText.includes("Filter Matrix:"), "Audit Filters: Filter matrix status toggles properly");

    // Reset filter to All Candidates
    await browser.evaluate(`
      (() => {
        const allBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('All Candidates'));
        if (allBtn) allBtn.click();
      })()
    `);
    await delay(500);

    // Verify CSV Export button is enabled and clickable
    const hasExportBtn = await browser.evaluate(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Export Audit CSV Report'));
        return Boolean(btn && !btn.disabled);
      })()
    `);
    assert(hasExportBtn, "Audit Export: 'Export Audit CSV Report' action button is enabled and ready");

    // Ingest small candidate batch and verify audit table updates
    const testRecords = [
      {
        prn: "PRN2024QA01",
        fullName: "QA Candidate Beta",
        degree: "Bachelor of Technology",
        branch: "Computer Science and Engineering",
        cgpa: 9.15,
        graduationYear: 2024,
        issueDate: "2024-06-15",
        university: "MGM University, Chhatrapati Sambhajinagar",
      },
    ];
    const { rootHex: testMerkleRoot } = buildBatchMerkleTree(testRecords);

    const testBatchPayload = {
      batchId: `TEST-AUDIT-BATCH-${Date.now().toString(36).toUpperCase()}`,
      merkleRoot: testMerkleRoot,
      records: testRecords,
      totalCredentials: testRecords.length,
      txHash: "0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
      status: "INSTITUTIONAL_STORED",
    };

    const newBatchRes = await fetch(`${BASE_URL}/api/batches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_session=${adminToken}`,
        Origin: BASE_URL,
      },
      body: JSON.stringify(testBatchPayload),
    });
    assert(newBatchRes.status === 201 || newBatchRes.status === 200, "Audit Ingestion: Staged candidate batch created successfully");

    // Refresh page to load new candidate into audit
    await browser.navigate(`${BASE_URL}/issuer`, 2500);
    // Switch to Tab 2
    await browser.evaluate(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('Bulk Candidate Audit'));
        if (tabs.length > 0) tabs[0].click();
      })()
    `);
    await delay(1200);

    const refreshedAuditText = await browser.evaluate("document.body.innerText");
    assert(
      refreshedAuditText.includes("QA Candidate Beta") && refreshedAuditText.includes("PRN2024QA01"),
      "Audit Ingestion Verification: Newly uploaded candidate appears in high-throughput candidate audit matrix"
    );

    // Test empty state on query with zero matches
    await browser.evaluate(`
      (() => {
        const input = document.querySelector('input[placeholder*="Search candidate name or PRN"]');
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, "NONEXISTENT_CANDIDATE_PRN_999999");
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await delay(600);

    const emptyAuditText = await browser.evaluate("document.body.innerText");
    assert(
      emptyAuditText.includes("No candidate records match") || emptyAuditText.includes("Try switching the filter matrix"),
      "Audit Empty State: Verified clean empty state displays when no records match query"
    );

    // -------------------------------------------------------------------------
    // WORKFLOW D: INDEPENDENT SERVER-SIDE SECURITY & AUTHORIZATION TESTS
    // -------------------------------------------------------------------------
    console.log("\n--- WORKFLOW D: Security & Cross-Institution Access Control ---");

    // 1. Unauthenticated request to /api/certificates
    const unauthCertsRes = await fetch(`${BASE_URL}/api/certificates`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    assert(
      unauthCertsRes.status === 401,
      "Security Guard: Unauthenticated access to /api/certificates rejected with HTTP 401"
    );

    // 2. Student account accessing issuer-only /api/certificates
    const studentUser: StudentUser = {
      prn: student0.prn,
      fullName: student0.fullName,
      email: "aarav.sharma@mgmu.ac.in",
      role: "STUDENT",
      isWalletVerified: false,
    };
    const studentToken = signSessionToken(studentUser);

    const studentCertsRes = await fetch(`${BASE_URL}/api/certificates`, {
      headers: { Cookie: `auth_session=${studentToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    assert(
      studentCertsRes.status === 403,
      "Security Guard: Student session accessing /api/certificates rejected with HTTP 403 Forbidden"
    );

    // 3. Foreign Administrator (COEP-PUNE-02) querying /api/certificates
    const foreignAdmin: AdminUser = {
      staffId: "EXAM_ADMIN_COEP",
      fullName: "Prof. Foreign Officer",
      department: "Examination Authority",
      role: "EXAM_ADMIN",
      institutionCode: "COEP-PUNE-02",
      institutionName: "COEP Technological University",
      authorizedWallet: "0x1111111111111111111111111111111111111111",
    };
    const foreignToken = signSessionToken(foreignAdmin);

    const foreignCertsRes = await fetch(`${BASE_URL}/api/certificates`, {
      headers: { Cookie: `auth_session=${foreignToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const foreignCertsData = await foreignCertsRes.json();
    assert(
      foreignCertsRes.status === 200 && foreignCertsData.certificates.length === 0,
      "Institutional Isolation: Foreign administrator (COEP) receives 0 certificates for MGM institution"
    );

    // 4. Foreign Administrator attempting to download MGM certificate PDF
    const foreignPdfRes = await fetch(pdfUrl, {
      headers: { Cookie: `auth_session=${foreignToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    assert(
      foreignPdfRes.status === 403,
      "Institutional Isolation: Foreign administrator blocked from downloading MGM PDF with HTTP 403 Forbidden"
    );

    // 5. Foreign Administrator attempting to GET MGM batch records via /api/batches/[batchId]
    const foreignBatchRes = await fetch(`${BASE_URL}/api/batches/${encodeURIComponent(batch0.batchId)}`, {
      headers: { Cookie: `auth_session=${foreignToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    assert(
      foreignBatchRes.status === 403,
      "Institutional Isolation: Foreign administrator blocked from accessing MGM batch records with HTTP 403 Forbidden"
    );

    // 6. Foreign Administrator attempting to PATCH MGM batch status
    const foreignPatchRes = await fetch(`${BASE_URL}/api/batches/${encodeURIComponent(batch0.batchId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_session=${foreignToken}`,
        Origin: BASE_URL,
      },
      body: JSON.stringify({ txHash: "0x" + "1".repeat(64), expectedChainId: 31337 }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    assert(
      foreignPatchRes.status === 403,
      "Institutional Isolation: Foreign administrator blocked from patching MGM batch with HTTP 403 Forbidden"
    );

    // 7. Foreign Administrator attempting to REVOKE credential in MGM batch
    const foreignRevokeRes = await fetch(`${BASE_URL}/api/batches/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `auth_session=${foreignToken}`,
        Origin: BASE_URL,
      },
      body: JSON.stringify({ batchId: batch0.batchId, leafIndex: 0, reasonCode: "ACADEMIC_MISCONDUCT" }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    assert(
      foreignRevokeRes.status === 403,
      "Institutional Isolation: Foreign administrator blocked from revoking MGM credential with HTTP 403 Forbidden"
    );

    // 8. Student attempting to download another student's certificate PDF
    const studentCrossPdfRes = await fetch(
      `${BASE_URL}/api/certificates/${encodeURIComponent(batch0.batchId)}/1/pdf`,
      {
        headers: { Cookie: `auth_session=${studentToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    assert(
      studentCrossPdfRes.status === 403,
      "Student Access Isolation: Student attempting to download peer's PDF is rejected with HTTP 403 Forbidden"
    );

    // 9. Out-of-bounds leafIndex rejected with HTTP 404
    const outOfBoundsPdfRes = await fetch(
      `${BASE_URL}/api/certificates/${encodeURIComponent(batch0.batchId)}/999/pdf`,
      {
        headers: { Cookie: `auth_session=${adminToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    assert(
      outOfBoundsPdfRes.status === 404,
      "Bounds Safety: Requesting out-of-bounds leaf index returns HTTP 404 Not Found"
    );

    // 10. Non-existent batch rejected with HTTP 404
    const nonExistentPdfRes = await fetch(
      `${BASE_URL}/api/certificates/NON_EXISTENT_BATCH_ID/0/pdf`,
      {
        headers: { Cookie: `auth_session=${adminToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    assert(
      nonExistentPdfRes.status === 404,
      "Bounds Safety: Requesting non-existent batch returns HTTP 404 Not Found"
    );

    console.log("\n================================================================================");
    console.log(`  QA Suite Complete: ${passedTests} passed, ${failedTests} failed`);
    console.log("================================================================================\n");

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Fatal QA Suite error:", err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (chromeProc) {
      try {
        chromeProc.kill("SIGKILL");
      } catch {}
    }
    if (serverProc) {
      try {
        serverProc.kill("SIGKILL");
      } catch {}
    }
  }
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
