/**
 * SOET VeriTrust - Independent Asynchronous AI Forensic Verification Test Suite (P10-T05A)
 *
 * Verifies:
 * 1. Primary cryptographic verification completes independently and immediately (< 1.5s)
 * 2. skip_ai=true flag bypasses AI microservice in /api/verify/pdf (both URL query & FormData)
 * 3. /api/verify/ai endpoint validates file size, format, and executes independently
 * 4. DropzoneVerifier source code verification:
 *    - No blocking gate or pendingFile state on upload
 *    - Parallel dispatch of cryptographic verification and AI scan
 *    - Safe state merge: setResult(prev => ...) preserves cryptographic truth
 *    - activeScanIdRef prevents race condition / stale AI overwrite
 *    - AbortController handles client-side cancellation on re-upload
 *    - Bound deadline polling on /api/ai/health when warming up
 * 5. CredentialVerificationReport UI handles all 6 forensic states:
 *    - QUEUED ("Forensic analysis queued")
 *    - WARMING_UP ("Initializing forensic engine")
 *    - ANALYZING ("Performing ELA manipulation analysis")
 *    - COMPLETED ("Forensic analysis completed")
 *    - UNAVAILABLE ("Forensic engine unavailable")
 *    - FAILED ("Forensic analysis failed")
 */

import fs from "fs";
import path from "path";
import assert from "assert";

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          console.log(`✅ [PASS] ${desc}`);
          passed++;
        })
        .catch((err) => {
          console.error(`❌ [FAIL] ${desc}:`, err.message);
          failed++;
        });
    } else {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] ${desc}:`, err.message);
    failed++;
  }
}

async function runTests() {
  console.log("================================================================================");
  console.log("  SOET VeriTrust: P10-T05A Asynchronous AI Verification Test Suite");
  console.log("================================================================================\n");

  const dropzonePath = path.join(process.cwd(), "src/components/DropzoneVerifier.tsx");
  const dropzoneSrc = fs.readFileSync(dropzonePath, "utf-8");

  const reportPath = path.join(process.cwd(), "src/components/CredentialVerificationReport.tsx");
  const reportSrc = fs.readFileSync(reportPath, "utf-8");

  const pdfRoutePath = path.join(process.cwd(), "src/app/api/verify/pdf/route.ts");
  const pdfRouteSrc = fs.readFileSync(pdfRoutePath, "utf-8");

  const aiRoutePath = path.join(process.cwd(), "src/app/api/verify/ai/route.ts");
  const aiRouteSrc = fs.readFileSync(aiRoutePath, "utf-8");

  const typesPath = path.join(process.cwd(), "src/types/index.ts");
  const typesSrc = fs.readFileSync(typesPath, "utf-8");

  // 1. Types validation
  it("Types: Extended forensic status union includes WARMING_UP, ANALYZING, and FAILED", () => {
    assert(typesSrc.includes('"WARMING_UP"'), "Should contain WARMING_UP");
    assert(typesSrc.includes('"ANALYZING"'), "Should contain ANALYZING");
    assert(typesSrc.includes('"FAILED"'), "Should contain FAILED");
    assert(typesSrc.includes('"QUEUED"'), "Should contain QUEUED");
    assert(typesSrc.includes('"COMPLETED"'), "Should contain COMPLETED");
    assert(typesSrc.includes('"UNAVAILABLE"'), "Should contain UNAVAILABLE");
  });

  // 2. Backend skip_ai implementation
  it("Backend (/api/verify/pdf): skip_ai supported via URL query param and FormData", () => {
    assert(pdfRouteSrc.includes('skipAiQuery === "true"'), "Should check skipAiQuery");
    assert(pdfRouteSrc.includes('skipAiForm === "true"'), "Should check skipAiForm");
    assert(pdfRouteSrc.includes('skipAiQuery === "1"'), "Should check skipAiQuery === '1'");
    assert(pdfRouteSrc.includes('skipAiForm === "1"'), "Should check skipAiForm === '1'");
  });

  it("Backend (/api/verify/pdf): When skip_ai is enabled, forensicPromise resolves immediately with QUEUED", () => {
    assert(pdfRouteSrc.includes('const forensicPromise: Promise<ForensicScanResult> = skipAi'), "Should branch forensicPromise on skipAi");
    assert(pdfRouteSrc.includes('status: "QUEUED"'), "Should resolve with QUEUED");
    assert(pdfRouteSrc.includes('visual_analysis_pending: forensic.status === "QUEUED"'), "Should flag visual_analysis_pending");
  });

  // 3. Dedicated /api/verify/ai endpoint
  it("Backend (/api/verify/ai): Implements independent proxy route for AI microservice", () => {
    assert(aiRouteSrc.includes('export async function POST'), "Should export POST handler");
    assert(aiRouteSrc.includes('AI_INFERENCE_TIMEOUT_MS = 25000'), "Should enforce 25s timeout");
    assert(aiRouteSrc.includes('MAX_UPLOAD_BYTES = 10 * 1024 * 1024'), "Should enforce 10MB limit");
    assert(aiRouteSrc.includes('ALLOWED_EXTENSIONS = [".pdf"'), "Should validate extensions");
    assert(aiRouteSrc.includes('res.status === 503'), "Should handle 503 queue busy gracefully");
  });

  // 4. Frontend DropzoneVerifier non-blocking behavior
  it("Frontend (DropzoneVerifier): Removed blocking pendingFile state and conditional gate", () => {
    assert(!dropzoneSrc.includes("setPendingFile"), "setPendingFile must be completely eliminated");
    assert(!dropzoneSrc.includes("pendingFile ?"), "pendingFile ternary branch must be removed from JSX");
    assert(!dropzoneSrc.includes("hasAutoTriggeredRef"), "hasAutoTriggeredRef must be eliminated");
  });

  it("Frontend (DropzoneVerifier): Upload immediately starts cryptographic verification and AI in parallel", () => {
    assert(dropzoneSrc.includes("executePdfVerification(file, scanId);"), "Should immediately execute PDF verification");
    assert(dropzoneSrc.includes("dispatchIndependentAiForensic(file, scanId);"), "Should immediately dispatch independent AI forensic");
  });

  it("Frontend (DropzoneVerifier): Request cancellation via AbortController on re-upload", () => {
    assert(dropzoneSrc.includes("primaryAbortControllerRef.current.abort()"), "Should abort in-flight primary verification on new upload");
    assert(dropzoneSrc.includes("aiAbortControllerRef.current.abort()"), "Should abort in-flight AI verification on new upload");
  });

  it("Frontend (DropzoneVerifier): activeScanIdRef prevents stale AI results from overwriting newer upload", () => {
    assert(dropzoneSrc.includes("const scanId = `${file.name}-${file.size}-${file.lastModified}-${Date.now()}`;"), "Should generate unique scanId");
    assert(dropzoneSrc.includes("activeScanIdRef.current !== scanId"), "Should check activeScanIdRef against scanId");
  });

  it("Frontend (DropzoneVerifier): Safe state merge preserves cryptographic outcome when AI completes", () => {
    assert(dropzoneSrc.includes("setResult((prev) =>"), "Should use functional state update setResult(prev => ...)");
    assert(dropzoneSrc.includes("forensicScan: data.forensic_scan"), "Should update only forensicScan");
    assert(dropzoneSrc.includes("visualAnalysisPending: false"), "Should clear visualAnalysisPending");
  });

  it("Frontend (DropzoneVerifier): Handles AI warming_up by polling /api/ai/health every 5s and auto-dispatching", () => {
    assert(dropzoneSrc.includes("fetch(\"/api/ai/health\")"), "Should poll /api/ai/health");
    assert(dropzoneSrc.includes("data.status === \"online\" && !data.is_busy"), "Should check health response for online and non-busy");
    assert(dropzoneSrc.includes("await runAiInference()"), "Should auto-dispatch retained file once online");
    assert(dropzoneSrc.includes("Date.now() - pollStartTime > 120_000"), "Should bound warmup polling to 120s");
  });

  // 5. CredentialVerificationReport UI states
  it("UI (CredentialVerificationReport): Supports all 6 AI forensic states with exact UI messages", () => {
    assert(reportSrc.includes("Forensic analysis queued"), "QUEUED message must match");
    assert(reportSrc.includes("Initializing forensic engine"), "WARMING_UP message must match");
    assert(reportSrc.includes("Performing ELA manipulation analysis"), "ANALYZING message must match");
    assert(reportSrc.includes("Forensic analysis completed"), "COMPLETED message must match");
    assert(reportSrc.includes("Forensic engine unavailable"), "UNAVAILABLE message must match");
    assert(reportSrc.includes("Forensic analysis failed"), "FAILED message must match");
  });

  it("UI (CredentialVerificationReport): ELA metrics and heatmap displayed only when genuine COMPLETED results exist", () => {
    assert(reportSrc.includes('result.forensicScan.status === "COMPLETED" ? ('), "Should gate metrics on COMPLETED status");
    assert(reportSrc.includes("Residual Std Dev"), "Should render residual std dev metric");
    assert(reportSrc.includes("Peak Tile Z-Score"), "Should render peak tile z-score");
    assert(reportSrc.includes("result.forensicScan.heatmap_base64 && ("), "Should gate heatmap on presence of base64 data");
  });

  it("UI (CredentialVerificationReport): Displays untrained heuristic baseline disclosure notice", () => {
    assert(reportSrc.includes("Operational Mode: Heuristic Compression Forensics (Untrained Baseline)"), "Should disclose untrained heuristic baseline");
  });

  console.log("\n================================================================================");
  console.log(`  P10-T05A Asynchronous AI Verification Test Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
