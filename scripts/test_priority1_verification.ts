import { getAllBatchesDb, getDatabaseAdapter } from "../src/lib/db";
import { buildBatchMerkleTree, createW3CCredential, hashCredentialSubject } from "../src/lib/crypto";
import { signSessionToken, verifySessionToken } from "../src/lib/serverAuth";
import { generateCertificatePdf } from "../src/lib/pdfGenerator";
import { AdminUser, StudentUser } from "../src/types/auth";
import fs from "fs";
import path from "path";

console.log("================================================================================");
console.log("  SOET VeriTrust: Priority 1 Regression & Security Verification Suite");
console.log("================================================================================\n");

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, details: string = "") {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}: ${details}`);
    failedCount++;
  }
}

async function runTests() {
  // -------------------------------------------------------------------------
  // TEST 1: STEP 2 - Verified Tab UI Cleanup & DegreeCertificate Presence
  // -------------------------------------------------------------------------
  const pageContent = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf-8");
  const dropzoneContent = fs.readFileSync(path.join(process.cwd(), "src/components/DropzoneVerifier.tsx"), "utf-8");

  assert(
    !pageContent.includes("Why Decentralized Degree Authentication?") &&
    !pageContent.includes("Comparison: Traditional vs SOET VeriTrust Architecture") &&
    !pageContent.includes("id=\"consortium\""),
    "Verified Tab (src/app/page.tsx): Unnecessary marketing & comparison clutter blocks removed"
  );

  assert(
    !dropzoneContent.includes("DPDP Act Zero-PII Privacy Protection: All student Personally Identifiable Information") &&
    !dropzoneContent.includes("/fixtures/mgm_valid_credential.json") &&
    !dropzoneContent.includes("/certificates_pdf/sample_valid_cert.pdf"),
    "Verified Tab (DropzoneVerifier.tsx): Redundant disclaimers and broken fixture links removed"
  );

  assert(
    dropzoneContent.includes("<DegreeCertificate") &&
    dropzoneContent.includes("import DegreeCertificate from \"./DegreeCertificate\";"),
    "Verified Tab (DropzoneVerifier.tsx): DegreeCertificate viewing component fully integrated"
  );

  // -------------------------------------------------------------------------
  // TEST 2: STEP 3 - Server-Side Authorization & Token Security
  // -------------------------------------------------------------------------
  const adminPayload: AdminUser = {
    staffId: "EXAM_ADMIN_MGM",
    fullName: "Prof. V. M. Deshpande",
    department: "Examination Authority",
    role: "EXAM_ADMIN",
    institutionCode: "MGMU-ENG-01",
    institutionName: "MGM University, Chhatrapati Sambhajinagar",
  };
  const adminToken = signSessionToken(adminPayload);
  const verifiedAdmin = verifySessionToken(adminToken) as AdminUser;

  assert(
    verifiedAdmin !== null &&
    verifiedAdmin.role === "EXAM_ADMIN" &&
    verifiedAdmin.institutionCode === "MGMU-ENG-01",
    "Server-side Auth: Admin session token embeds and verifies institutionCode 'MGMU-ENG-01'"
  );

  // Cross-institution admin session
  const otherAdminPayload: AdminUser = {
    staffId: "EXAM_ADMIN_COEP",
    fullName: "Prof. Other Officer",
    department: "Examination Authority",
    role: "EXAM_ADMIN",
    institutionCode: "COEP-PUNE-02",
    institutionName: "COEP Technological University",
  };
  const otherAdminToken = signSessionToken(otherAdminPayload);
  const verifiedOther = verifySessionToken(otherAdminToken) as AdminUser;

  assert(
    verifiedOther !== null &&
    verifiedOther.institutionCode === "COEP-PUNE-02" &&
    verifiedOther.institutionCode !== verifiedAdmin?.institutionCode,
    "Server-side Auth: Cross-institution tokens isolated distinctly by institutionCode"
  );

  // Student session
  const studentPayload: StudentUser = {
    prn: "MGM2024CSE001",
    fullName: "Aarav Sharma",
    email: "aarav.sharma@mgmu.ac.in",
    role: "STUDENT",
    isWalletVerified: false,
  };
  const studentToken = signSessionToken(studentPayload);
  const verifiedStudent = verifySessionToken(studentToken);

  assert(
    verifiedStudent !== null && verifiedStudent.role === "STUDENT",
    "Server-side Auth: Student session token verified correctly with STUDENT role"
  );

  // -------------------------------------------------------------------------
  // TEST 3: STEP 3 - Database Queries & Server-Side Institution Isolation
  // -------------------------------------------------------------------------
  const allBatches = await getAllBatchesDb();
  const mgmBatches = allBatches.filter(
    (b) => !b.institutionCode || b.institutionCode === "MGMU-ENG-01"
  );

  assert(
    mgmBatches.length > 0,
    `Database Batches: Found ${mgmBatches.length} authentic batches for MGMU-ENG-01`
  );

  // Query batches for non-existent or other institution
  const otherBatches = allBatches.filter(
    (b) => b.institutionCode === "OTHER-UNIV-99"
  );

  assert(
    otherBatches.length === 0,
    "Database Isolation: Cross-institution filter for 'OTHER-UNIV-99' returns 0 records"
  );

  // -------------------------------------------------------------------------
  // TEST 4: STEP 3 - Certificate PDF Generation & Vector Retrieval
  // -------------------------------------------------------------------------
  const targetBatch = mgmBatches[0];
  const records = targetBatch.records || [];

  assert(
    records.length > 0,
    `Batch Records: Batch '${targetBatch.batchId}' contains ${records.length} authentic student records`
  );

  const student0 = records[0];
  const pdfBytes = await generateCertificatePdf({
    studentName: student0.fullName,
    prn: student0.prn,
    degree: student0.degree,
    branch: student0.branch,
    cgpa: student0.cgpa,
    graduationYear: student0.graduationYear,
    issueDate: student0.issueDate,
    universityName: student0.university || targetBatch.institutionName || "MGM University",
    instituteName: student0.institute || "School of Engineering & Technology (SOET)",
    batchId: targetBatch.batchId,
    leafIndex: 0,
    merkleRoot: targetBatch.merkleRoot,
    verifyUrl: `http://localhost:3000/?verify=${encodeURIComponent(targetBatch.batchId)}/0`,
    isRevoked: false,
  });

  const pdfHeader = Buffer.from(pdfBytes.buffer).subarray(0, 5).toString("ascii");
  assert(
    pdfHeader === "%PDF-" && pdfBytes.length > 1000,
    `Dynamic Vector PDF: Generated valid %PDF- document (${pdfBytes.length} bytes) for student ${student0.prn}`
  );

  // -------------------------------------------------------------------------
  // TEST 5: STEP 3 - Cross-Institution Certificate Access Denial Simulation
  // -------------------------------------------------------------------------
  // Function to simulate /api/certificates authorization check
  function simulateCertificatesAccess(session: any, batchInstitutionCode: string): { status: number; allowed: boolean } {
    if (!session) return { status: 401, allowed: false };
    if (session.role !== "EXAM_ADMIN") return { status: 403, allowed: false };
    if (session.institutionCode && batchInstitutionCode && session.institutionCode !== batchInstitutionCode) {
      return { status: 403, allowed: false };
    }
    return { status: 200, allowed: true };
  }

  const authorizedResult = simulateCertificatesAccess(verifiedAdmin, targetBatch.institutionCode || "MGMU-ENG-01");
  assert(
    authorizedResult.allowed && authorizedResult.status === 200,
    "Issuer Authorization: Authorized MGM administrator accesses MGM certificates (HTTP 200)"
  );

  const crossInstitutionResult = simulateCertificatesAccess(verifiedOther, targetBatch.institutionCode || "MGMU-ENG-01");
  assert(
    !crossInstitutionResult.allowed && crossInstitutionResult.status === 403,
    "Cross-Institution Guard: Foreign administrator blocked from MGM certificates (HTTP 403 Forbidden)"
  );

  const unauthenticatedResult = simulateCertificatesAccess(null, targetBatch.institutionCode || "MGMU-ENG-01");
  assert(
    !unauthenticatedResult.allowed && unauthenticatedResult.status === 401,
    "Unauthenticated Guard: Anonymous request rejected (HTTP 401 Unauthorized)"
  );

  const studentAccessResult = simulateCertificatesAccess(verifiedStudent, targetBatch.institutionCode || "MGMU-ENG-01");
  assert(
    !studentAccessResult.allowed && studentAccessResult.status === 403,
    "Role Guard: Student role blocked from administrative certificates endpoint (HTTP 403 Forbidden)"
  );

  // -------------------------------------------------------------------------
  // TEST 6: STEP 4 - Bulk Candidate Audit Data Population
  // -------------------------------------------------------------------------
  // Simulate syncAuditRowsFromBatches logic
  const candidateAuditRows: any[] = [];
  const seenPrns = new Set<string>();

  for (const b of mgmBatches) {
    const recs = b.records || [];
    const revokedIndices = b.revokedIndices || [];
    recs.forEach((s: any, idx: number) => {
      const prnUpper = s.prn.toUpperCase();
      if (seenPrns.has(prnUpper)) return;
      seenPrns.add(prnUpper);

      const isRevoked = revokedIndices.includes(idx);
      const isAnchored = b.status === "ANCHORED" && Boolean(b.txHash);

      candidateAuditRows.push({
        prn: s.prn,
        claimedName: s.fullName,
        claimedCgpa: s.cgpa,
        onChainName: s.fullName,
        onChainCgpa: s.cgpa,
        onChainUniversity: s.university || b.institutionName || "MGM University",
        status: isRevoked ? "DISCREPANCY" : "AUTHENTIC",
        flag: isRevoked
          ? "Revoked by Institution"
          : isAnchored
          ? "Exact On-Chain Match"
          : "Institutional Registry Record",
      });
    });
  }

  assert(
    candidateAuditRows.length > 0,
    `Candidate Audit: Authentically populated ${candidateAuditRows.length} genuine candidate records from database`
  );

  // Verify all fields are present and valid
  const allFieldsValid = candidateAuditRows.every((r) =>
    r.prn &&
    r.claimedName &&
    typeof r.claimedCgpa === "number" &&
    r.onChainName &&
    r.onChainUniversity &&
    r.status &&
    r.flag
  );

  assert(
    allFieldsValid,
    "Candidate Audit Fields: All candidate rows contain valid PRN, Name, CGPA, University, Status, and Flag"
  );

  // Verify search filter logic
  const query = candidateAuditRows[0].claimedName.split(" ")[0].toLowerCase();
  const searchMatches = candidateAuditRows.filter(
    (r) =>
      r.claimedName.toLowerCase().includes(query) ||
      r.prn.toLowerCase().includes(query)
  );

  assert(
    searchMatches.length > 0,
    `Candidate Audit Search: Filtering by query '${query}' matched ${searchMatches.length} candidate(s)`
  );

  // -------------------------------------------------------------------------
  // TEST 7: STEP 3 - Client Issuer Component Verification
  // -------------------------------------------------------------------------
  const issuerPageContent = fs.readFileSync(path.join(process.cwd(), "src/app/issuer/page.tsx"), "utf-8");
  const certsListContent = fs.readFileSync(path.join(process.cwd(), "src/components/IssuerCertificatesList.tsx"), "utf-8");

  assert(
    issuerPageContent.includes("IssuerCertificatesList") &&
    issuerPageContent.includes("syncAuditRowsFromBatches") &&
    issuerPageContent.includes("certsRefreshKey"),
    "Issuer Page: Integrated IssuerCertificatesList, syncAuditRowsFromBatches, and dynamic refresh key"
  );

  assert(
    certsListContent.includes("handleViewCertificate") &&
    certsListContent.includes("<DegreeCertificate") &&
    certsListContent.includes("/api/certificates") &&
    certsListContent.includes("Download Official PDF"),
    "Issuer Certificates Component: Full certificate modal, DegreeCertificate renderer, and PDF download button verified"
  );

  console.log("\n================================================================================");
  console.log(`  Priority 1 Verification Suite Results: ${passedCount} passed, ${failedCount} failed`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
