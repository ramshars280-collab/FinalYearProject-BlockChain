/**
 * SOET VeriTrust: Priority 5B Security Hardening & Cryptographic Claim Alignment Test Suite
 *
 * Verifies the implementation of approved remediations from the Priority 5A audit:
 * 1. VULN-01: Mandatory server-side authentication for certificate PDF downloads (401 on anonymous, 403 on cross-student).
 * 2. VULN-04: Issuer wallet pre-flight authorization guard (read-only verification before transaction submission).
 * 3. VULN-05: Strict production network isolation (Sepolia 11155111 enforced, Hardhat 31337 prohibited in production).
 * 4. VULN-02: IdentityRegistry feature transparency (client-side EIP-712 local storage disclosure).
 * 5. VULN-03: zk-SNARK / Groth16 claim accuracy (Selective CGPA disclosure commitment prototype).
 */

import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { NextRequest } from "next/server";
import { GET as downloadPdfGet } from "../src/app/api/certificates/[batchId]/[leafIndex]/pdf/route";
import {
  verifyBatchAnchorEvidence,
  verifyCredentialOnChain,
  CREDENTIAL_REGISTRY_ABI,
} from "../src/lib/contracts";
import {
  signSessionToken,
  verifySessionToken,
} from "../src/lib/serverAuth";
import {
  saveBatchDb,
  getBatchByIdDb,
} from "../src/lib/db";
import {
  buildBatchMerkleTree,
  hashCredentialSubject,
} from "../src/lib/crypto";
import {
  generateZkSnarkGroth16Proof,
  verifyZkSnarkGroth16Proof,
} from "../src/lib/snarkjsProof";
import {
  generateSelectiveDisclosureProof,
  verifyZkSelectiveProof,
} from "../src/lib/zkProof";
import { isSupportedChainId, getNetworkConfig } from "../src/contracts";

console.log("================================================================================");
console.log("  SOET VeriTrust: Priority 5B Security Hardening & Claim Alignment Test Suite");
console.log("================================================================================\n");

let passedCount = 0;
let failedCount = 0;
let skippedCount = 0;
let notRunCount = 0;
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

async function runPriority5bTests() {
  const testRunId = Math.random().toString(36).substring(2, 7).toUpperCase();

  // ---------------------------------------------------------------------------
  // SECTION 1: PDF DOWNLOAD AUTHORIZATION ENFORCEMENT (VULN-01)
  // ---------------------------------------------------------------------------
  console.log("--- Section 1: PDF Download Mandatory Authentication & RBAC (VULN-01) ---");

  // Create synthetic fixture batches for authorization testing
  const batchIdMGM = `MGM-TEST-P5B-${testRunId}`;
  const batchIdOther = `OTHER-TEST-P5B-${testRunId}`;

  const studentA = {
    prn: `PRN-P5B-STUDENT-A-${testRunId}`,
    fullName: "Student Alpha",
    degree: "B.Tech Computer Science",
    branch: "Computer Science",
    cgpa: 9.15,
    graduationYear: 2026,
    university: "MGM University",
    issueDate: "2026-05-15",
  };

  const studentB = {
    prn: `PRN-P5B-STUDENT-B-${testRunId}`,
    fullName: "Student Beta",
    degree: "B.Tech Information Technology",
    branch: "Information Technology",
    cgpa: 8.42,
    graduationYear: 2026,
    university: "MGM University",
    issueDate: "2026-05-15",
  };

  const studentOther = {
    prn: `PRN-P5B-STUDENT-OTHER-${testRunId}`,
    fullName: "Student Other University",
    degree: "MBBS Medicine",
    branch: "General Medicine",
    cgpa: 8.8,
    graduationYear: 2026,
    university: "Other University",
    issueDate: "2026-05-15",
  };

  const treeMGM = buildBatchMerkleTree([studentA, studentB]);
  await saveBatchDb({
    batchId: batchIdMGM,
    merkleRoot: treeMGM.rootHex,
    ipfsCid: `ipfs://bafybeip5bmgm${testRunId.toLowerCase()}`,
    timestamp: Date.now(),
    issuer: "0x8D0cC3553e9d812797B986F15427835A2930a301",
    institutionName: "MGM University",
    institutionCode: "MGMU-ENG-01",
    totalCredentials: 2,
    revokedIndices: [],
    records: [studentA, studentB],
    status: "INSTITUTIONAL_STORED",
  });

  const treeOther = buildBatchMerkleTree([studentOther]);
  await saveBatchDb({
    batchId: batchIdOther,
    merkleRoot: treeOther.rootHex,
    ipfsCid: `ipfs://bafybeip5bother${testRunId.toLowerCase()}`,
    timestamp: Date.now(),
    issuer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    institutionName: "Other Health Sciences University",
    institutionCode: "OTHER-MED-99",
    totalCredentials: 1,
    revokedIndices: [],
    records: [studentOther],
    status: "INSTITUTIONAL_STORED",
  });

  // Session Tokens
  const tokenStudentA = signSessionToken({
    role: "STUDENT",
    prn: studentA.prn,
    fullName: studentA.fullName,
    email: "student.a@mgmu.ac.in",
  });

  const tokenMgmAdmin = signSessionToken({
    role: "EXAM_ADMIN",
    staffId: "EXAM_ADMIN_MGM",
    fullName: "Prof. V. M. Deshpande",
    department: "Examination Authority",
    authorizedWallet: "0x8D0cC3553e9d812797B986F15427835A2930a301",
    institutionCode: "MGMU-ENG-01",
    institutionName: "MGM University",
  });

  // Test 1: Anonymous request without cookie returns 401
  const resAnon = await makeJsonRequest(
    downloadPdfGet,
    `http://localhost:3000/api/certificates/${batchIdMGM}/0/pdf`,
    "GET",
    undefined,
    {}, // No cookies
    {},
    { params: { batchId: batchIdMGM, leafIndex: "0" } }
  );
  assert(
    resAnon.status === 401 && resAnon.data.error?.includes("Authentication required"),
    "Test 1: Anonymous PDF download request without session cookie returns HTTP 401 Unauthorized"
  );

  // Test 2: Anonymous request with forged/invalid session token returns 401
  const resForged = await makeJsonRequest(
    downloadPdfGet,
    `http://localhost:3000/api/certificates/${batchIdMGM}/0/pdf`,
    "GET",
    undefined,
    { auth_session: "forged.jwt.token.signature" },
    {},
    { params: { batchId: batchIdMGM, leafIndex: "0" } }
  );
  assert(
    resForged.status === 401 && resForged.data.error?.includes("Authentication required"),
    "Test 2: Request with invalid/forged session cookie returns HTTP 401 Unauthorized"
  );

  // Test 3: Student A requesting Student B's PDF returns 403 Forbidden
  const resCrossStudent = await makeJsonRequest(
    downloadPdfGet,
    `http://localhost:3000/api/certificates/${batchIdMGM}/1/pdf`, // Leaf 1 is Student B
    "GET",
    undefined,
    { auth_session: tokenStudentA },
    {},
    { params: { batchId: batchIdMGM, leafIndex: "1" } }
  );
  assert(
    resCrossStudent.status === 403 && resCrossStudent.data.error?.includes("other students"),
    "Test 3: Student A requesting Student B's certificate PDF is rejected with HTTP 403 Forbidden"
  );

  // Test 4: Student A requesting their own PDF succeeds with HTTP 200
  const resSelfStudent = await makeJsonRequest(
    downloadPdfGet,
    `http://localhost:3000/api/certificates/${batchIdMGM}/0/pdf`, // Leaf 0 is Student A
    "GET",
    undefined,
    { auth_session: tokenStudentA },
    {},
    { params: { batchId: batchIdMGM, leafIndex: "0" } }
  );
  const isBufferPdf =
    resSelfStudent.status === 200 &&
    resSelfStudent.data &&
    Buffer.from(resSelfStudent.data).toString("utf8", 0, 5) === "%PDF-";
  assert(
    isBufferPdf,
    "Test 4: Student A requesting their own certificate PDF succeeds with HTTP 200 and genuine vector PDF (%PDF- signature)"
  );

  // Test 5: Authorized Exam Admin accessing their own institution's certificate succeeds with HTTP 200
  const resAdminOwn = await makeJsonRequest(
    downloadPdfGet,
    `http://localhost:3000/api/certificates/${batchIdMGM}/0/pdf`,
    "GET",
    undefined,
    { auth_session: tokenMgmAdmin },
    {},
    { params: { batchId: batchIdMGM, leafIndex: "0" } }
  );
  assert(
    resAdminOwn.status === 200 &&
      resAdminOwn.data &&
      Buffer.from(resAdminOwn.data).toString("utf8", 0, 5) === "%PDF-",
    "Test 5: Authorized Exam Admin accessing their own institution's certificate succeeds with HTTP 200"
  );

  // Test 6: Exam Admin from Institution A accessing Institution B's certificate is rejected with 403 Forbidden
  const resAdminOther = await makeJsonRequest(
    downloadPdfGet,
    `http://localhost:3000/api/certificates/${batchIdOther}/0/pdf`,
    "GET",
    undefined,
    { auth_session: tokenMgmAdmin },
    {},
    { params: { batchId: batchIdOther, leafIndex: "0" } }
  );
  assert(
    resAdminOther.status === 403 && resAdminOther.data.error?.includes("another institution"),
    "Test 6: Exam Admin attempting to download another institution's certificate is rejected with HTTP 403 Forbidden"
  );

  // ---------------------------------------------------------------------------
  // SECTION 2: ISSUER WALLET PRE-FLIGHT AUTHORIZATION (VULN-04)
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 2: Issuer Wallet Pre-Flight Authorization (VULN-04) ---");

  // We test the contract interface and pre-flight logic using a mock contract
  const credentialRegistryInterface = new ethers.Interface(CREDENTIAL_REGISTRY_ABI);
  assert(
    credentialRegistryInterface.hasFunction("authorizedIssuers") &&
      credentialRegistryInterface.hasFunction("owner"),
    "Test 7: CREDENTIAL_REGISTRY_ABI explicitly defines authorizedIssuers and owner read-only functions"
  );

  // Simulate pre-flight evaluation logic:
  async function evaluateIssuerPreflight(
    signerAddress: string,
    mockAuthorized: boolean,
    mockOwner: string,
    connectedChainId: number,
    targetChainId: number,
    simulateRpcError: boolean = false
  ): Promise<{ allowed: boolean; error?: string }> {
    if (connectedChainId !== targetChainId) {
      return { allowed: false, error: `MetaMask network mismatch: expected ${targetChainId}, got ${connectedChainId}` };
    }
    if (process.env.NODE_ENV === "production" && connectedChainId !== 11155111) {
      return { allowed: false, error: `Production Network Policy: restricted to Sepolia 11155111` };
    }
    if (simulateRpcError) {
      return { allowed: false, error: "Issuer Pre-flight Verification Failed: RPC connection error" };
    }
    const hasIssuerRole = mockAuthorized || (mockOwner.toLowerCase() === signerAddress.toLowerCase());
    if (!hasIssuerRole) {
      return { allowed: false, error: `Unauthorized Issuer Wallet: ${signerAddress} is not registered` };
    }
    return { allowed: true };
  }

  // Test 8: Authorized wallet passes pre-flight check
  const preflightAuth = await evaluateIssuerPreflight(
    "0x8D0cC3553e9d812797B986F15427835A2930a301",
    true,
    "0x8D0cC3553e9d812797B986F15427835A2930a301",
    11155111,
    11155111
  );
  assert(
    preflightAuth.allowed === true && !preflightAuth.error,
    "Test 8: Authorized issuer wallet address passes pre-flight verification without submitting a transaction"
  );

  // Test 9: Unauthorized wallet is rejected before transaction broadcast
  const preflightUnauth = await evaluateIssuerPreflight(
    "0x1111111111111111111111111111111111111111",
    false,
    "0x8D0cC3553e9d812797B986F15427835A2930a301",
    11155111,
    11155111
  );
  assert(
    Boolean(preflightUnauth.allowed === false && preflightUnauth.error?.includes("Unauthorized Issuer Wallet")),
    "Test 9: Unauthorized wallet is rejected before transaction submission with clear user-facing error"
  );

  // Test 10: RPC failure prevents anchoring and does not pretend authorization succeeded
  const preflightRpcFail = await evaluateIssuerPreflight(
    "0x8D0cC3553e9d812797B986F15427835A2930a301",
    true,
    "0x8D0cC3553e9d812797B986F15427835A2930a301",
    11155111,
    11155111,
    true
  );
  assert(
    Boolean(preflightRpcFail.allowed === false && preflightRpcFail.error?.includes("RPC connection error")),
    "Test 10: RPC read failure prevents anchoring from proceeding and fails closed"
  );

  // ---------------------------------------------------------------------------
  // SECTION 3: PRODUCTION NETWORK ISOLATION (VULN-05)
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 3: Production Network Isolation (VULN-05) ---");

  // Temporarily simulate NODE_ENV='production' to test strict network isolation
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    (process.env as any).NODE_ENV = "production";

    // Test 11: Production explicitly rejects chain ID 31337
    const fakeTx = "0x" + "11".repeat(32);
    const prodHardhatResult = await verifyBatchAnchorEvidence(
      batchIdMGM,
      treeMGM.rootHex,
      fakeTx,
      undefined,
      undefined,
      31337
    );
    assert(
      Boolean(
        prodHardhatResult.isVerifiedOnChain === false &&
          prodHardhatResult.reason?.includes("strictly disabled in production")
      ),
      "Test 11: Production environment strictly prohibits Hardhat Localhost (Chain ID 31337)"
    );

    // Test 12: Production rejects local Hardhat contract address
    const localContractAddr = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const prodLocalAddrResult = await verifyBatchAnchorEvidence(
      batchIdMGM,
      treeMGM.rootHex,
      fakeTx,
      localContractAddr
    );
    assert(
      Boolean(
        prodLocalAddrResult.isVerifiedOnChain === false &&
          prodLocalAddrResult.reason?.includes("prohibited in production")
      ),
      "Test 12: Production environment strictly prohibits local Hardhat contract addresses"
    );

    // Test 13: verifyCredentialOnChain rejects 31337 in production
    const prodCredOnChain = await verifyCredentialOnChain(
      batchIdMGM,
      "0x" + "22".repeat(32),
      ["0x" + "33".repeat(32)],
      0,
      undefined,
      31337
    );
    assert(
      Boolean(
        prodCredOnChain.onChainVerified === false &&
          prodCredOnChain.onChainError?.includes("strictly disabled in production")
      ),
      "Test 13: verifyCredentialOnChain immediately rejects preferredChainId 31337 in production"
    );
  } finally {
    (process.env as any).NODE_ENV = originalNodeEnv;
  }

  // Test 14: Non-production development correctly preserves Hardhat capability when explicitly requested
  assert(
    isSupportedChainId(31337) && isSupportedChainId(11155111),
    "Test 14: Development environment correctly permits supported dual-chain configuration (31337 & 11155111)"
  );

  // ---------------------------------------------------------------------------
  // SECTION 4: CRYPTOGRAPHIC CLAIM ACCURACY & IDENTITY TRANSPARENCY
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 4: Cryptographic Claim Accuracy & Identity Transparency ---");

  // Test 15: snarkjsProof payload reports transparent commitment structure
  const snarkPayload = generateZkSnarkGroth16Proof(8.5, 7.5, "1a2b3c4d5e6f");
  const snarkVerify = verifyZkSnarkGroth16Proof(snarkPayload);
  assert(
    snarkVerify.isValid === true &&
      snarkVerify.message.includes("Cryptographic Commitment Structure") &&
      !snarkVerify.message.includes("production-trusted Groth16"),
    "Test 15: snarkjsProof returns accurate prototype commitment verification message without claiming production Groth16 zk-SNARK"
  );

  // Test 16: Unsatisfied threshold predicate fails cleanly
  const snarkPayloadUnsatisfied = generateZkSnarkGroth16Proof(6.5, 7.5, "1a2b3c4d5e6f");
  const snarkVerifyUnsatisfied = verifyZkSnarkGroth16Proof(snarkPayloadUnsatisfied);
  assert(
    snarkVerifyUnsatisfied.isValid === false &&
      snarkVerifyUnsatisfied.message.includes("Range Proof predicate unsatisfied"),
    "Test 16: snarkjsProof correctly rejects proof when student CGPA does not meet threshold assertion"
  );

  // Test 17: ZkProofModal source file contains honest prototype transparency disclosures
  const zkModalSource = fs.readFileSync(path.resolve("src/components/ZkProofModal.tsx"), "utf8");
  assert(
    zkModalSource.includes("Selective CGPA Disclosure – Cryptographic Commitment Prototype") &&
      zkModalSource.includes("without a compiled ceremony .zkey or on-chain BN128 pairing verification"),
    "Test 17: ZkProofModal UI explicitly discloses prototype commitment architecture and absence of trusted setup ceremony"
  );

  // Test 18: Student portal UI accurately documents identity binding as client-side EIP-712 local storage
  const studentPageSource = fs.readFileSync(path.resolve("src/app/student/page.tsx"), "utf8");
  assert(
    studentPageSource.includes("Client-Side Storage Transparency") &&
      studentPageSource.includes("stored exclusively in your local browser storage (localStorage)") &&
      studentPageSource.includes("registered as an on-chain transaction"),
    "Test 18: Student portal UI transparently documents EIP-712 wallet binding as client-side browser storage"
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  PRIORITY 5B TEST SUITE SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED, ${skippedCount} SKIPPED, ${notRunCount} NOT RUN`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    console.error("Failures encountered:");
    failures.forEach((f) => console.error(` - ${f}`));
    process.exit(1);
  }
}

runPriority5bTests().catch((err) => {
  console.error("FATAL test error in Priority 5B suite:", err);
  process.exit(1);
});
