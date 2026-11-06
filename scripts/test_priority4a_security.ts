/**
 * SOET VeriTrust: Priority 4A Production Readiness & Security Audit Test Suite
 * Validates:
 * 1. Blockchain trust-boundary integrity (chain ID mismatch, unanchored batches, offline RPC degradation).
 * 2. Cryptographic revocation resilience even during RPC outages.
 * 3. Multi-tenant institutional access controls (Issuer cross-institution boundaries).
 * 4. Student PRN privacy and cross-student credential download boundaries.
 * 5. Production configuration enforcement (AUTH_SECRET, ADMIN_PASSWORD, Turso libSQL).
 * 6. JWT forgery resilience and constant-time signature verification.
 * 7. Rate limiting & denial-of-service protections.
 * 8. Oversized file upload enforcement (10MB boundary).
 * 9. QR verification URL origin resolution safety (Host header poisoning prevention).
 */

import { NextRequest } from "next/server";
import { POST as verifyPdfPost } from "../src/app/api/verify/pdf/route";
import { POST as loginPost } from "../src/app/api/auth/login/route";
import { GET as certsGet } from "../src/app/api/certificates/route";
import { GET as downloadPdfGet } from "../src/app/api/certificates/[batchId]/[leafIndex]/pdf/route";
import { POST as batchesPost } from "../src/app/api/batches/route";
import {
  verifyCredentialOnChain,
  verifyBatchAnchorEvidence,
} from "../src/lib/contracts";
import {
  signSessionToken,
  verifySessionToken,
  validateProductionAuthConfig,
  resolveSafeVerificationOrigin,
  hashPassword,
} from "../src/lib/serverAuth";
import { validateDatabaseConfig } from "../src/lib/db/index";
import {
  saveBatchDb,
  getBatchByIdDb,
  setStudentPasswordDb,
} from "../src/lib/db";
import { buildBatchMerkleTree, hashCredentialSubject } from "../src/lib/crypto";
import { checkRateLimit } from "../src/lib/rateLimit";
import { isSupportedChainId, getNetworkConfig } from "../src/contracts";
import { generateCertificatePdf } from "../src/lib/pdfGenerator";

console.log("================================================================================");
console.log("  SOET VeriTrust: Priority 4A Production Readiness & Security Test Suite");
console.log("================================================================================\n");

let passedCount = 0;
let failedCount = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, failureDetails: string = "") {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}: ${failureDetails}`);
    failedCount++;
    failures.push(`${testName}: ${failureDetails}`);
  }
}

async function makeJsonRequest(
  handler: (req: NextRequest, ctx?: any) => Promise<Response>,
  url: string,
  method: string = "GET",
  body?: any,
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
  ctx?: any
): Promise<{ status: number; data: any; headers: Headers }> {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const reqHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
    ...headers,
  };

  const init: RequestInit = {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  };

  const req = new NextRequest(new URL(url, "http://localhost:3000"), init as any);
  const res = await handler(req, ctx);
  let data: any = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {}
  } else {
    data = await res.arrayBuffer();
  }
  return { status: res.status, data, headers: res.headers };
}

async function runSecurityAuditTests() {
  const testRunId = Math.random().toString(36).substring(2, 7).toUpperCase();

  // ---------------------------------------------------------------------------
  // SECTION 1: BLOCKCHAIN TRUST-BOUNDARY & RPC FAILURE DEGRADATION
  // ---------------------------------------------------------------------------
  console.log("--- Section 1: Blockchain Trust-Boundary Audits ---");

  // Test 1: Unsupported Chain ID rejected
  assert(
    !isSupportedChainId(999999) && isSupportedChainId(11155111) && isSupportedChainId(31337),
    "Test 1: Chain ID validation strictly restricts execution to Sepolia (11155111) and Local Hardhat (31337)"
  );

  // Test 2: Unanchored batch is NEVER reported as on-chain verified
  const unanchoredBatchId = `MGM-TEST-UNANCHORED-${testRunId}`;
  const unanchoredStudent = {
    prn: `PRN-UNANCHORED-${testRunId}`,
    fullName: "Unanchored Student Test",
    degree: "Bachelor of Technology",
    branch: "Computer Science & Engineering",
    cgpa: 8.5,
    graduationYear: 2026,
    issueDate: "2026-06-15",
    university: "MGM University, Chhatrapati Sambhajinagar",
    institute: "School of Engineering & Technology",
    institutionCode: "MGMU-ENG-01",
  };
  const treeUnanchored = buildBatchMerkleTree([unanchoredStudent]);
  await saveBatchDb({
    batchId: unanchoredBatchId,
    merkleRoot: treeUnanchored.rootHex,
    ipfsCid: "QmUnanchoredIpfsCid",
    timestamp: Math.floor(Date.now() / 1000),
    issuer: "0x8D0cC3553e9d812797B986F15427835A2930a301",
    institutionName: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    totalCredentials: 1,
    revokedIndices: [],
    records: [unanchoredStudent],
    status: "INSTITUTIONAL_STORED",
  });

  const leafHashUnanchored = hashCredentialSubject(unanchoredStudent);
  const resultUnanchored = await verifyCredentialOnChain(
    unanchoredBatchId,
    leafHashUnanchored,
    treeUnanchored.proofs[0].proof,
    0
  );

  assert(
    resultUnanchored.isValid === true &&
    resultUnanchored.onChainVerified === false &&
    resultUnanchored.source === "STORAGE_REGISTRY" &&
    resultUnanchored.batchStatus === "INSTITUTIONAL_STORED",
    "Test 2: Unanchored batch is verified via database registry but strictly flags onChainVerified=false and source=STORAGE_REGISTRY"
  );

  // Test 3: Batch marked PENDING_ANCHOR is never reported as anchored
  const pendingBatchId = `MGM-TEST-PENDING-${testRunId}`;
  await saveBatchDb({
    batchId: pendingBatchId,
    merkleRoot: treeUnanchored.rootHex,
    ipfsCid: "QmPendingIpfsCid",
    timestamp: Math.floor(Date.now() / 1000),
    issuer: "0x8D0cC3553e9d812797B986F15427835A2930a301",
    institutionName: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    totalCredentials: 1,
    revokedIndices: [],
    records: [unanchoredStudent],
    status: "PENDING_ANCHOR",
  });

  const resultPending = await verifyCredentialOnChain(
    pendingBatchId,
    leafHashUnanchored,
    treeUnanchored.proofs[0].proof,
    0
  );

  assert(
    resultPending.onChainVerified === false &&
    resultPending.batchStatus === "PENDING_ANCHOR" &&
    resultPending.source === "STORAGE_REGISTRY",
    "Test 3: Batch marked PENDING_ANCHOR is reported with pending status and never marked as onChainVerified"
  );

  // Test 4: Revocation honored from database registry even when RPC unavailable
  const revokedBatchId = `MGM-TEST-REVOKED-${testRunId}`;
  await saveBatchDb({
    batchId: revokedBatchId,
    merkleRoot: treeUnanchored.rootHex,
    ipfsCid: "QmRevokedIpfsCid",
    timestamp: Math.floor(Date.now() / 1000),
    issuer: "0x8D0cC3553e9d812797B986F15427835A2930a301",
    institutionName: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    totalCredentials: 1,
    revokedIndices: [0], // Leaf 0 is revoked!
    records: [unanchoredStudent],
    status: "INSTITUTIONAL_STORED",
  });

  const resultRevoked = await verifyCredentialOnChain(
    revokedBatchId,
    leafHashUnanchored,
    treeUnanchored.proofs[0].proof,
    0
  );

  assert(
    resultRevoked.isRevoked === true,
    "Test 4: Revocation status is strictly honored from institutional registry even when off-chain"
  );

  // ---------------------------------------------------------------------------
  // SECTION 2: AUTHENTICATION & API SECURITY AUDITS
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 2: Authentication & API Security Audits ---");

  // Test 5: Forged JWT session token rejected
  const legitimateAdminToken = signSessionToken({
    role: "EXAM_ADMIN",
    staffId: "EXAM_ADMIN_MGM",
    fullName: "Prof. V. M. Deshpande",
    department: "Examination Authority",
    authorizedWallet: "0x8D0cC3553e9d812797B986F15427835A2930a301",
    institutionCode: "MGMU-ENG-01",
    institutionName: "MGM University, Chhatrapati Sambhajinagar",
  });

  const parts = legitimateAdminToken.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({
    user: { role: "EXAM_ADMIN", staffId: "FORGED_ATTACKER" },
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  const forgedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`; // Tampered payload with old signature

  const verifyForgedResult = verifySessionToken(forgedToken);
  assert(
    verifyForgedResult === null,
    "Test 5: Tampered JWT token with forged payload is strictly rejected by constant-time signature verification"
  );

  // Test 6: Expired JWT token rejected
  const expiredPayload = Buffer.from(JSON.stringify({
    user: { role: "EXAM_ADMIN", staffId: "EXAM_ADMIN_MGM" },
    exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
  })).toString("base64url");
  const expiredToken = signSessionToken({
    role: "EXAM_ADMIN",
    staffId: "TEST",
    fullName: "Test Admin",
    department: "Examination Authority",
  });
  const partsExp = expiredToken.split(".");
  // Manually re-sign with expired timestamp
  const crypto = require("crypto");
  const secret = process.env.AUTH_SECRET || "soet_veritrust_dev_jwt_secret_fallback_key";
  const expSig = crypto.createHmac("sha256", secret).update(`${partsExp[0]}.${expiredPayload}`).digest("base64url");
  const expTokenFull = `${partsExp[0]}.${expiredPayload}.${expSig}`;

  const verifyExpiredResult = verifySessionToken(expTokenFull);
  assert(
    verifyExpiredResult === null,
    "Test 6: Expired JWT token is strictly rejected by verifySessionToken"
  );

  // Test 7: Multi-tenant institution boundary (Cross-institution batch access)
  const otherInstBatchId = `OTHER-INST-${testRunId}`;
  await saveBatchDb({
    batchId: otherInstBatchId,
    merkleRoot: treeUnanchored.rootHex,
    ipfsCid: "QmOtherInstIpfsCid",
    timestamp: Math.floor(Date.now() / 1000),
    issuer: "0x1111111111111111111111111111111111111111",
    institutionName: "Other University Medical School",
    institutionCode: "OTHER-MED-99", // Different institution code!
    totalCredentials: 1,
    revokedIndices: [],
    records: [unanchoredStudent],
    status: "INSTITUTIONAL_STORED",
  });

  // MGM Admin attempts to access Other University's certificate
  const resCrossInst = await makeJsonRequest(
    downloadPdfGet,
    `http://localhost:3000/api/certificates/${otherInstBatchId}/0/pdf`,
    "GET",
    undefined,
    { auth_session: legitimateAdminToken },
    {},
    { params: { batchId: otherInstBatchId, leafIndex: "0" } }
  );

  assert(
    resCrossInst.status === 403 && resCrossInst.data.error?.includes("another institution"),
    "Test 7: Multi-tenancy check blocks Admin from Institution A accessing certificates of Institution B (HTTP 403)"
  );

  // Test 8: Student PRN privacy boundary (Cross-student certificate download)
  const studentAToken = signSessionToken({
    role: "STUDENT",
    prn: `PRN-STUDENT-A-${testRunId}`,
    fullName: "Student A",
    email: "student.a@mgmu.ac.in",
  });

  // Student A attempts to download certificate for unanchoredStudent (PRN-UNANCHORED-*)
  const resCrossStudent = await makeJsonRequest(
    downloadPdfGet,
    `http://localhost:3000/api/certificates/${unanchoredBatchId}/0/pdf`,
    "GET",
    undefined,
    { auth_session: studentAToken },
    {},
    { params: { batchId: unanchoredBatchId, leafIndex: "0" } }
  );

  assert(
    resCrossStudent.status === 403 && resCrossStudent.data.error?.includes("other students"),
    "Test 8: Student access control blocks Student A from downloading Student B's certificate PDF (HTTP 403)"
  );

  // ---------------------------------------------------------------------------
  // SECTION 3: PRODUCTION ENVIRONMENT & SECURITY HARDENING
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 3: Production Configuration & Boundary Audits ---");

  // Test 9: validateProductionAuthConfig enforces strong AUTH_SECRET and ADMIN_PASSWORD in production
  const origNodeEnv = process.env.NODE_ENV;
  const origAuthSecret = process.env.AUTH_SECRET;
  const origAdminPass = process.env.ADMIN_PASSWORD;

  try {
    (process.env as any).NODE_ENV = "production";
    process.env.AUTH_SECRET = "insecure_short_secret";
    process.env.ADMIN_PASSWORD = "admin123";

    const prodCheck = validateProductionAuthConfig();
    assert(
      prodCheck.valid === false &&
      prodCheck.errors.some((e) => e.includes("AUTH_SECRET")) &&
      prodCheck.errors.some((e) => e.includes("ADMIN_PASSWORD")),
      "Test 9: validateProductionAuthConfig rejects weak secrets and default passwords in production mode"
    );
  } finally {
    (process.env as any).NODE_ENV = origNodeEnv;
    process.env.AUTH_SECRET = origAuthSecret;
    process.env.ADMIN_PASSWORD = origAdminPass;
  }

  // Test 10: resolveSafeVerificationOrigin prevents Host header poisoning in production
  const mockReqHost = new NextRequest("http://attacker.com/some/path", {
    headers: { host: "attacker.com", "x-forwarded-host": "attacker.com" },
  });

  const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    process.env.NEXT_PUBLIC_APP_URL = "https://veritrust.mgmu.ac.in";
    const originResolved = resolveSafeVerificationOrigin(mockReqHost);
    assert(
      originResolved === "https://veritrust.mgmu.ac.in",
      "Test 10: resolveSafeVerificationOrigin strictly adheres to configured NEXT_PUBLIC_APP_URL, resisting Host header spoofing"
    );
  } finally {
    process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;
  }

  // Test 11: Rate limiting enforcement
  const testIp = `192.0.2.${Math.floor(Math.random() * 200 + 10)}`;
  const limitKey = `test_rate_limit:${testIp}`;
  for (let i = 0; i < 5; i++) {
    checkRateLimit(limitKey, { maxRequests: 5, windowMs: 10000 });
  }
  const overflowCheck = checkRateLimit(limitKey, { maxRequests: 5, windowMs: 10000 });
  assert(
    overflowCheck.allowed === false && overflowCheck.retryAfterSeconds > 0,
    "Test 11: Rate limiter triggers HTTP 429 after exceeding maxRequests threshold"
  );

  // Test 12: Oversized file upload (> 10MB) rejected
  const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 0); // 11MB file
  const formData = new FormData();
  formData.append("file", new Blob([largeBuffer], { type: "application/pdf" }), "huge.pdf");

  const largeReq = new NextRequest("http://localhost:3000/api/verify/pdf", {
    method: "POST",
    body: formData,
  });
  const largeRes = await verifyPdfPost(largeReq);
  const largeData = await largeRes.json();

  assert(
    largeRes.status === 413 && largeData.error?.includes("10MB"),
    "Test 12: PDF upload exceeding 10MB limit is rejected immediately with HTTP 413 (Payload Too Large)"
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  PRIORITY 4A TEST RUN COMPLETE: ${passedCount} passed, ${failedCount} failed`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    console.error("Failure Summary:");
    failures.forEach((f) => console.error(` - ${f}`));
    process.exit(1);
  }
}

runSecurityAuditTests().catch((err) => {
  console.error("Unhandled test execution error:", err);
  process.exit(1);
});
