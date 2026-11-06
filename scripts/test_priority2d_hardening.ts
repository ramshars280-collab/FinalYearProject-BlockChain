/**
 * SOET VeriTrust: Priority 2D Hardening & Verification Semantics Test Suite
 * Validates:
 * 1. Absence of deceptive database value substitution for missing extracted fields
 * 2. Realistic formatting variation handling (case, spacing, honorifics, punctuation)
 * 3. Prevention of partial/ambiguous name matching attacks
 * 4. Institution scoping & security boundary enforcement
 * 5. Outcome taxonomy semantics (AUTHENTIC, CRYPTOGRAPHICALLY_INVALID, REVOKED, SEMANTIC_MISMATCH, INCONCLUSIVE)
 * 6. Explicit disclosure of pending/offline visual forensic states
 */

import { generateCertificatePdf } from "../src/lib/pdfGenerator";
import { POST } from "../src/app/api/verify/pdf/route";
import { NextRequest } from "next/server";
import { getBatchByIdDb } from "../src/lib/db";

console.log("================================================================================");
console.log("  SOET VeriTrust: Priority 2D Verification Hardening & Security Suite");
console.log("================================================================================\n");

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details: string = "") {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}: ${details}`);
    failed++;
  }
}

async function callVerify(pdfBuffer: Buffer, filename: string = "cert.pdf", skipAi: boolean = true): Promise<any> {
  const formData = new FormData();
  const file = new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" });
  formData.append("file", file, filename);
  const url = `http://localhost:3000/api/verify/pdf${skipAi ? "?skip_ai=true" : ""}`;
  const req = new NextRequest(url, {
    method: "POST",
    body: formData,
  });
  const res = await POST(req);
  const data = await res.json();
  return { status: res.status, data };
}

async function runHardeningSuite() {
  const batch01 = (await getBatchByIdDb("MGM-2024-BTECH-BATCH01"))!;
  const student0 = batch01.records[0]; // Aarav Sharma, PRN20200101, CGPA 9.24, B.Tech CSE, 2024

  // ---------------------------------------------------------------------------
  // 1. Missing fields must NEVER be substituted with database values
  // ---------------------------------------------------------------------------
  // Generate PDF without explicit CGPA text or with CGPA omitted from the template
  const pdfNoCgpa = await generateCertificatePdf({
    studentName: student0.fullName,
    prn: student0.prn,
    degree: student0.degree,
    branch: student0.branch,
    cgpa: 0, // Zero or omitted
    graduationYear: student0.graduationYear,
    issueDate: student0.issueDate,
    universityName: student0.university,
    instituteName: "School of Engineering & Technology",
    batchId: batch01.batchId,
    leafIndex: 0,
    merkleRoot: batch01.merkleRoot,
    verifyUrl: `http://localhost:3000/?verify=${encodeURIComponent(batch01.batchId)}/0`,
    isRevoked: false,
  });

  const res1 = await callVerify(pdfNoCgpa);
  // Extracted CGPA should be 0 or undefined, NOT replaced with 9.24
  assert(
    res1.data.pdfExtracted?.cgpa === 0 || res1.data.pdfExtracted?.cgpa === undefined,
    "Hardening 1: Missing/zero extracted CGPA is not deceptively backfilled with database CGPA (9.24)"
  );

  // ---------------------------------------------------------------------------
  // 2. Realistic format variations: Honorifics & uppercase normalization
  // ---------------------------------------------------------------------------
  const pdfHonorific = await generateCertificatePdf({
    studentName: "Mr. Aarav Sharma", // Honorific prefix
    prn: "prn20200101", // Lowercase PRN
    degree: "Bachelor of Technology",
    branch: "Computer Science & Engineering",
    cgpa: 9.24,
    graduationYear: 2024,
    issueDate: student0.issueDate,
    universityName: student0.university,
    instituteName: "School of Engineering & Technology",
    batchId: batch01.batchId,
    leafIndex: 0,
    merkleRoot: batch01.merkleRoot,
    verifyUrl: `http://localhost:3000/?verify=${encodeURIComponent(batch01.batchId)}/0`,
    isRevoked: false,
  });

  const res2 = await callVerify(pdfHonorific);
  assert(
    res2.data.isValid === true &&
    res2.data.semantic_check?.status === "MATCH",
    "Hardening 2: Realistic formatting (Honorific 'Mr.' and lowercase PRN) normalized cleanly to verified match"
  );

  // ---------------------------------------------------------------------------
  // 3. Partial/Ambiguous name matching attack prevention
  // ---------------------------------------------------------------------------
  // Attacker puts only common surname "Sharma" on certificate claiming it matches "Aarav Sharma"
  const pdfPartialSurname = await generateCertificatePdf({
    studentName: "Sharma", // Only surname
    prn: student0.prn,
    degree: student0.degree,
    branch: student0.branch,
    cgpa: student0.cgpa,
    graduationYear: student0.graduationYear,
    issueDate: student0.issueDate,
    universityName: student0.university,
    instituteName: "School of Engineering & Technology",
    batchId: batch01.batchId,
    leafIndex: 0,
    merkleRoot: batch01.merkleRoot,
    verifyUrl: `http://localhost:3000/?verify=${encodeURIComponent(batch01.batchId)}/0`,
    isRevoked: false,
  });

  const res3 = await callVerify(pdfPartialSurname);
  assert(
    res3.data.isValid === false &&
    res3.data.verification_outcome === "SEMANTIC_MISMATCH" &&
    res3.data.diagnostic_code === "CLAIM_MISMATCH_NAME",
    "Hardening 3: Partial surname attack ('Sharma' vs 'Aarav Sharma') blocked with CLAIM_MISMATCH_NAME"
  );

  // ---------------------------------------------------------------------------
  // 4. Conflicting token attack prevention
  // ---------------------------------------------------------------------------
  // Attacker puts "Aarav Patel" on certificate claiming it matches "Aarav Sharma"
  const pdfConflictingName = await generateCertificatePdf({
    studentName: "Aarav Patel",
    prn: student0.prn,
    degree: student0.degree,
    branch: student0.branch,
    cgpa: student0.cgpa,
    graduationYear: student0.graduationYear,
    issueDate: student0.issueDate,
    universityName: student0.university,
    instituteName: "School of Engineering & Technology",
    batchId: batch01.batchId,
    leafIndex: 0,
    merkleRoot: batch01.merkleRoot,
    verifyUrl: `http://localhost:3000/?verify=${encodeURIComponent(batch01.batchId)}/0`,
    isRevoked: false,
  });

  const res4 = await callVerify(pdfConflictingName);
  assert(
    res4.data.isValid === false &&
    res4.data.verification_outcome === "SEMANTIC_MISMATCH" &&
    res4.data.diagnostic_code === "CLAIM_MISMATCH_NAME",
    "Hardening 4: Conflicting surname attack ('Aarav Patel' vs 'Aarav Sharma') blocked with CLAIM_MISMATCH_NAME"
  );

  // ---------------------------------------------------------------------------
  // 5. Explicit disclosure of visual forensic pending state
  // ---------------------------------------------------------------------------
  const genuinePdf = await generateCertificatePdf({
    studentName: student0.fullName,
    prn: student0.prn,
    degree: student0.degree,
    branch: student0.branch,
    cgpa: student0.cgpa,
    graduationYear: student0.graduationYear,
    issueDate: student0.issueDate,
    universityName: student0.university,
    instituteName: "School of Engineering & Technology",
    batchId: batch01.batchId,
    leafIndex: 0,
    merkleRoot: batch01.merkleRoot,
    verifyUrl: `http://localhost:3000/?verify=${encodeURIComponent(batch01.batchId)}/0`,
    isRevoked: false,
  });

  // Call with skipAi = true (simulating deferred / background visual forensic analysis)
  const res5 = await callVerify(genuinePdf, "cert.pdf", true);
  assert(
    res5.data.isValid === true &&
    res5.data.visual_analysis_pending === true &&
    res5.data.forensic_scan?.status === "QUEUED" &&
    res5.data.diagnostic_message?.includes("deferred"),
    "Hardening 5: Visual analysis pending state explicitly disclosed without invalidating valid on-chain proof"
  );

  // ---------------------------------------------------------------------------
  // 6. Out of bounds leaf index rejection
  // ---------------------------------------------------------------------------
  const pdfOobLeaf = await generateCertificatePdf({
    studentName: student0.fullName,
    prn: student0.prn,
    degree: student0.degree,
    branch: student0.branch,
    cgpa: student0.cgpa,
    graduationYear: student0.graduationYear,
    issueDate: student0.issueDate,
    universityName: student0.university,
    instituteName: "School of Engineering & Technology",
    batchId: batch01.batchId,
    leafIndex: 9999, // Out of bounds
    merkleRoot: batch01.merkleRoot,
    verifyUrl: `http://localhost:3000/?verify=${encodeURIComponent(batch01.batchId)}/9999`,
    isRevoked: false,
  });

  const res6 = await callVerify(pdfOobLeaf);
  assert(
    res6.data.isValid === false &&
    res6.data.verification_outcome === "CRYPTOGRAPHICALLY_INVALID" &&
    res6.data.diagnostic_code === "RECORD_NOT_IN_DATABASE",
    "Hardening 6: Out-of-bounds leaf index rejected safely as CRYPTOGRAPHICALLY_INVALID"
  );

  // ---------------------------------------------------------------------------
  // 7. Security: Unknown batch ID boundary protection
  // ---------------------------------------------------------------------------
  const pdfUnknownBatch = await generateCertificatePdf({
    studentName: "Foreign Student",
    prn: "PRN99999999",
    degree: "Bachelor of Arts",
    branch: "History",
    cgpa: 7.5,
    graduationYear: 2023,
    issueDate: "2023-05-10",
    universityName: "Rogue University",
    instituteName: "Rogue Institute",
    batchId: "NONEXISTENT-ROGUE-BATCH",
    leafIndex: 0,
    merkleRoot: "0x1234567890123456789012345678901234567890123456789012345678901234",
    verifyUrl: "http://localhost:3000/?verify=nonexistent/0",
    isRevoked: false,
  });

  const res7 = await callVerify(pdfUnknownBatch);
  assert(
    res7.data.isValid === false &&
    res7.data.isUnregistered === true &&
    res7.data.verification_outcome === "CRYPTOGRAPHICALLY_INVALID" &&
    res7.data.diagnostic_code === "UNREGISTERED_ISSUER",
    "Hardening 7: Foreign batch cannot cross institution boundary; rejected as UNREGISTERED_ISSUER"
  );

  console.log("\n================================================================================");
  console.log(`  Priority 2D Hardening Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runHardeningSuite().catch((err) => {
  console.error("Hardening test suite failed:", err);
  process.exit(1);
});

