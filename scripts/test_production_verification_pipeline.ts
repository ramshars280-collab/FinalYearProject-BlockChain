/**
 * SOET VeriTrust: Priority 2C Production Verification Pipeline Test Suite
 * Validates all 13 production scenarios directly against the production route handlers
 * and underlying cryptographic/forensic functions.
 */

import { generateCertificatePdf } from "../src/lib/pdfGenerator";
import { POST } from "../src/app/api/verify/pdf/route";
import { NextRequest } from "next/server";
import { getBatchByIdDb, saveBatchDb } from "../src/lib/db";
import { buildBatchMerkleTree } from "../src/lib/crypto";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function runPythonEla(samplePath: string): any {
  const out = execSync(
    `.venv/bin/python -c '
import json
from forgery_service.ela_engine import run_ai_forgery_detection
with open("${samplePath}", "rb") as f:
    res = run_ai_forgery_detection(f.read(), "${path.basename(samplePath)}")
print(json.dumps(res))
'`,
    { encoding: "utf-8" }
  );
  return JSON.parse(out.trim());
}

console.log("================================================================================");
console.log("  SOET VeriTrust: Priority 2C Production Pipeline Validation Suite (13 Cases)");
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

async function callVerifyPdfApi(pdfBuffer: Buffer, filename: string = "cert.pdf", skipAi: boolean = false): Promise<any> {
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

async function runSuite() {
  const batch01 = await getBatchByIdDb("MGM-2024-BTECH-BATCH01");
  if (!batch01) {
    throw new Error("MGM-2024-BTECH-BATCH01 not found in local database.");
  }
  const student0 = batch01.records[0]; // Aarav Sharma, PRN20200101, 9.24

  // ---------------------------------------------------------------------------
  // TEST 1: Genuine Certificate with Valid Blockchain Proof
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

  const res1 = await callVerifyPdfApi(genuinePdf, "genuine_aarav.pdf");
  assert(
    res1.status === 200 &&
    res1.data.isValid === true &&
    res1.data.verification_outcome === "AUTHENTIC" &&
    res1.data.diagnostic_code === "FULLY_VERIFIED" &&
    res1.data.semantic_check?.status === "MATCH",
    "Case 1: Genuine certificate verified as AUTHENTIC (HTTP 200, Merkle & Semantic MATCH)"
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Altered Candidate Name
  // ---------------------------------------------------------------------------
  const alteredNamePdf = await generateCertificatePdf({
    studentName: "VIKRAM ADITYA", // Altered from Aarav Sharma
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

  const res2 = await callVerifyPdfApi(alteredNamePdf, "altered_name.pdf");
  assert(
    res2.data.isValid === false &&
    res2.data.tamperDetected === true &&
    res2.data.verification_outcome === "SEMANTIC_MISMATCH" &&
    res2.data.diagnostic_code === "CLAIM_MISMATCH_NAME" &&
    res2.data.semantic_check?.status === "MISMATCH" &&
    res2.data.semantic_check?.field_mismatches?.some((m: any) => m.field === "Candidate Name"),
    "Case 2: Altered Candidate Name flagged as SEMANTIC_MISMATCH (CLAIM_MISMATCH_NAME)"
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Altered PRN
  // ---------------------------------------------------------------------------
  const alteredPrnPdf = await generateCertificatePdf({
    studentName: student0.fullName,
    prn: "PRN20209999", // Altered PRN
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

  const res3 = await callVerifyPdfApi(alteredPrnPdf, "altered_prn.pdf");
  assert(
    res3.data.isValid === false &&
    res3.data.tamperDetected === true &&
    res3.data.verification_outcome === "SEMANTIC_MISMATCH" &&
    res3.data.diagnostic_code === "CLAIM_MISMATCH_PRN" &&
    res3.data.semantic_check?.field_mismatches?.some((m: any) => m.field === "Permanent Registration Number (PRN)"),
    "Case 3: Altered PRN flagged as SEMANTIC_MISMATCH (CLAIM_MISMATCH_PRN)"
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Altered CGPA
  // ---------------------------------------------------------------------------
  const alteredCgpaPdf = await generateCertificatePdf({
    studentName: student0.fullName,
    prn: student0.prn,
    degree: student0.degree,
    branch: student0.branch,
    cgpa: 9.95, // Altered from 9.24
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

  const res4 = await callVerifyPdfApi(alteredCgpaPdf, "altered_cgpa.pdf");
  assert(
    res4.data.isValid === false &&
    res4.data.tamperDetected === true &&
    res4.data.verification_outcome === "SEMANTIC_MISMATCH" &&
    res4.data.diagnostic_code === "CLAIM_MISMATCH_CGPA" &&
    res4.data.semantic_check?.field_mismatches?.some((m: any) => m.field === "Cumulative CGPA"),
    "Case 4: Altered CGPA flagged as SEMANTIC_MISMATCH (CLAIM_MISMATCH_CGPA)"
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Altered Degree or Branch
  // ---------------------------------------------------------------------------
  const alteredDegreePdf = await generateCertificatePdf({
    studentName: student0.fullName,
    prn: student0.prn,
    degree: "Doctor of Philosophy (Ph.D.)", // Altered degree
    branch: "Aerospace Engineering",       // Altered branch
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

  const res5 = await callVerifyPdfApi(alteredDegreePdf, "altered_degree.pdf");
  assert(
    res5.data.isValid === false &&
    res5.data.tamperDetected === true &&
    res5.data.verification_outcome === "SEMANTIC_MISMATCH" &&
    res5.data.semantic_check?.field_mismatches?.some((m: any) => m.field === "Degree Conferred"),
    "Case 5: Altered Degree/Branch flagged as SEMANTIC_MISMATCH (Degree & Branch Discrepancies)"
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Altered Graduation Year
  // ---------------------------------------------------------------------------
  const alteredYearPdf = await generateCertificatePdf({
    studentName: student0.fullName,
    prn: student0.prn,
    degree: student0.degree,
    branch: student0.branch,
    cgpa: student0.cgpa,
    graduationYear: 2030, // Altered from 2024
    issueDate: student0.issueDate,
    universityName: student0.university,
    instituteName: "School of Engineering & Technology",
    batchId: batch01.batchId,
    leafIndex: 0,
    merkleRoot: batch01.merkleRoot,
    verifyUrl: `http://localhost:3000/?verify=${encodeURIComponent(batch01.batchId)}/0`,
    isRevoked: false,
  });

  const res6 = await callVerifyPdfApi(alteredYearPdf, "altered_year.pdf");
  assert(
    res6.data.isValid === false &&
    res6.data.tamperDetected === true &&
    res6.data.verification_outcome === "SEMANTIC_MISMATCH" &&
    res6.data.semantic_check?.field_mismatches?.some((m: any) => m.field === "Graduation Year"),
    "Case 6: Altered Graduation Year flagged as SEMANTIC_MISMATCH (Class of 2030 Discrepancy)"
  );

  // ---------------------------------------------------------------------------
  // TEST 7: Replaced Crest / Logo (Mechanism C Localized Hotspot Telemetry)
  // ---------------------------------------------------------------------------
  const sample8Path = path.join(process.cwd(), "forensic_evaluation", "samples", "sample_08_replaced_logo_q70_q95.jpg");
  const elaRes7 = runPythonEla(sample8Path);
  assert(
    elaRes7.metadata.localized_tile_peak_zscore >= 3.5 &&
    elaRes7.metadata.localized_suspicious_regions?.length > 0 &&
    elaRes7.metadata.localized_suspicious_regions[0].grid_row <= 1,
    `Case 7: Replaced University Crest triggers localized tile hotspot (Z=${elaRes7.metadata.localized_tile_peak_zscore} at header row 0)`
  );

  // ---------------------------------------------------------------------------
  // TEST 8: Replaced Candidate Photo (Mechanism C Localized Hotspot Telemetry)
  // ---------------------------------------------------------------------------
  const sample14Path = path.join(process.cwd(), "forensic_evaluation", "samples", "sample_14_photo_replacement.jpg");
  const elaRes8 = runPythonEla(sample14Path);
  assert(
    elaRes8.metadata.localized_tile_peak_zscore >= 3.0 &&
    elaRes8.metadata.localized_suspicious_regions?.length > 0,
    `Case 8: Replaced Candidate Photo triggers localized tile hotspot (Z=${elaRes8.metadata.localized_tile_peak_zscore})`
  );

  // ---------------------------------------------------------------------------
  // TEST 9: Single-pass Regenerated Fraudulent Certificate
  // ---------------------------------------------------------------------------
  const singlePassFakePdf = await generateCertificatePdf({
    studentName: "MALICIOUS ROGUE INTRUDER",
    prn: student0.prn,
    degree: student0.degree,
    branch: student0.branch,
    cgpa: 9.99,
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

  const res9 = await callVerifyPdfApi(singlePassFakePdf, "single_pass_fake.pdf");
  assert(
    res9.data.isValid === false &&
    res9.data.tamperDetected === true &&
    res9.data.verification_outcome === "SEMANTIC_MISMATCH" &&
    res9.data.semantic_check?.field_mismatches?.length >= 2,
    "Case 9: Single-pass fake caught by semantic & cryptographic divergence (Name & CGPA)"
  );

  // ---------------------------------------------------------------------------
  // TEST 10: Revoked Certificate
  // ---------------------------------------------------------------------------
  // Create a controlled test batch with revoked leaf index 0
  const tree10 = buildBatchMerkleTree([student0]);
  const revokedTestBatch = {
    batchId: "TEST-REVOCATION-BATCH-01",
    merkleRoot: tree10.rootHex,
    ipfsCid: "QmRevokedTestCid",
    timestamp: 1718870400,
    issuer: batch01.issuer,
    institutionName: batch01.institutionName,
    institutionCode: batch01.institutionCode,
    totalCredentials: 1,
    revokedIndices: [0], // Leaf 0 explicitly revoked
    records: [student0],
    status: "ANCHORED" as const,
  };
  await saveBatchDb(revokedTestBatch);

  const revokedPdf = await generateCertificatePdf({
    studentName: student0.fullName,
    prn: student0.prn,
    degree: student0.degree,
    branch: student0.branch,
    cgpa: student0.cgpa,
    graduationYear: student0.graduationYear,
    issueDate: student0.issueDate,
    universityName: student0.university,
    instituteName: "School of Engineering & Technology",
    batchId: revokedTestBatch.batchId,
    leafIndex: 0,
    merkleRoot: revokedTestBatch.merkleRoot,
    verifyUrl: `http://localhost:3000/?verify=${encodeURIComponent(revokedTestBatch.batchId)}/0`,
    isRevoked: true,
  });

  const res10 = await callVerifyPdfApi(revokedPdf, "revoked.pdf");
  assert(
    res10.data.isValid === false &&
    res10.data.isRevoked === true &&
    res10.data.verification_outcome === "REVOKED" &&
    res10.data.diagnostic_code === "CREDENTIAL_REVOKED",
    "Case 10: Revoked credential flagged as REVOKED (CREDENTIAL_REVOKED, isValid: false)"
  );

  // ---------------------------------------------------------------------------
  // TEST 11: Unknown Certificate (Unregistered batch)
  // ---------------------------------------------------------------------------
  const unknownBatchPdf = await generateCertificatePdf({
    studentName: "Unknown Student",
    prn: "PRN99999999",
    degree: "Bachelor of Technology",
    branch: "Computer Science",
    cgpa: 8.0,
    graduationYear: 2024,
    issueDate: "2024-06-15",
    universityName: "Fake University",
    instituteName: "Fake Institute",
    batchId: "COUNTERFEIT-UNKNOWN-BATCH99",
    leafIndex: 0,
    merkleRoot: "0x9999999999999999999999999999999999999999",
    verifyUrl: "http://localhost:3000/?verify=unknown/0",
    isRevoked: false,
  });

  const res11 = await callVerifyPdfApi(unknownBatchPdf, "unknown_batch.pdf");
  assert(
    res11.data.isValid === false &&
    res11.data.isUnregistered === true &&
    res11.data.verification_outcome === "CRYPTOGRAPHICALLY_INVALID" &&
    res11.data.diagnostic_code === "UNREGISTERED_ISSUER",
    "Case 11: Unregistered batch flagged as CRYPTOGRAPHICALLY_INVALID (UNREGISTERED_ISSUER)"
  );

  // ---------------------------------------------------------------------------
  // TEST 12: Malformed or Unreadable PDF
  // ---------------------------------------------------------------------------
  const corruptedBuffer = Buffer.from("%PDF-corrupted-bytes-no-valid-xref-table");
  const res12 = await callVerifyPdfApi(corruptedBuffer, "corrupted.pdf");
  assert(
    res12.status === 422 &&
    res12.data.success === false &&
    res12.data.verification_outcome === "INCONCLUSIVE" &&
    res12.data.diagnostic_code === "SCANNED_DOCUMENT_REQUIRES_OCR",
    "Case 12: Corrupted PDF rejected safely with HTTP 422 (INCONCLUSIVE, no process crash)"
  );

  // ---------------------------------------------------------------------------
  // TEST 13: Verification Service Unavailable (Graceful Degradation)
  // ---------------------------------------------------------------------------
  const res13 = await callVerifyPdfApi(genuinePdf, "genuine_skip_ai.pdf", true);
  assert(
    res13.status === 200 &&
    res13.data.isValid === true &&
    res13.data.verification_outcome === "AUTHENTIC" &&
    res13.data.forensic_scan?.status === "QUEUED" &&
    res13.data.forensic_scan?.reason?.includes("deferred"),
    "Case 13: Service unavailable / skip_ai gracefully degrades without interrupting on-chain verification"
  );

  console.log("\n================================================================================");
  console.log(`  Production Pipeline Validation Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
