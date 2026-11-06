import fs from "fs";
import path from "path";
import React from "react";
import ReactDOMServer from "react-dom/server";
import CredentialVerificationReport, {
  computeAcademicInformationStatus,
  computeReportStatus,
} from "../src/components/CredentialVerificationReport";
import { VerificationResult } from "../src/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`);
    failed++;
  }
}

async function run() {
  console.log("================================================================================");
  console.log("  SOET VeriTrust: Semantic Extraction & Academic Claim Integrity Test Suite");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST 1: Genuine Synthetic Certificate - Full 6/6 Academic Claims Verified
  // ---------------------------------------------------------------------------
  console.log("--- 1. Genuine Synthetic Test Certificate Verification ---");
  const genuinePdfPath = "1_Authentic_Degree_Aarav_Sharma.pdf";
  assert(fs.existsSync(genuinePdfPath), `Genuine PDF certificate exists at ${genuinePdfPath}`);

  const genuineBuffer = fs.readFileSync(genuinePdfPath);
  const formData1 = new FormData();
  formData1.append("file", new Blob([genuineBuffer], { type: "application/pdf" }), "1_Authentic_Degree_Aarav_Sharma.pdf");
  formData1.append("skip_ai", "true");

  const res1 = await fetch("http://localhost:3000/api/verify/pdf?skip_ai=true", {
    method: "POST",
    body: formData1,
  });
  const data1 = await res1.json();

  assert(res1.status === 200, "API returns HTTP 200 for genuine certificate");
  assert(data1.success === true, "API reports success: true");
  assert(data1.verification_outcome === "AUTHENTIC", "Cryptographic verification outcome is AUTHENTIC");

  const claimed1 = data1.semantic_check?.claimed;
  const certified1 = data1.semantic_check?.certified;
  const mismatches1 = data1.semantic_check?.field_mismatches;

  assert(claimed1?.studentName === "Aarav Sharma", `Student Name extracted: "${claimed1?.studentName}" === "Aarav Sharma"`);
  assert(claimed1?.prn === "PRN20200101", `PRN extracted: "${claimed1?.prn}" === "PRN20200101"`);
  assert(claimed1?.degree === "Bachelor of Technology", `Degree extracted: "${claimed1?.degree}" === "Bachelor of Technology"`);
  assert(claimed1?.branch === "Computer Science & Engineering", `Branch extracted: "${claimed1?.branch}" === "Computer Science & Engineering"`);
  assert(claimed1?.cgpa === 9.24, `CGPA extracted: ${claimed1?.cgpa} === 9.24`);
  assert(claimed1?.graduationYear === 2024, `Graduation Year extracted: ${claimed1?.graduationYear} === 2024`);

  assert(Array.isArray(mismatches1) && mismatches1.length === 0, `0 semantic mismatches detected (count: ${mismatches1?.length || 0})`);
  assert(data1.semantic_check?.status === "MATCH", "Semantic check status is 'MATCH'");

  // Test UI rendering of the genuine 6/6 result
  const mockCred: any = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential"],
    id: "urn:uuid:test-1",
    issuer: { id: "did:ethr:0x1", name: "MGM University" },
    issuanceDate: new Date().toISOString(),
    credentialSubject: { fullName: "Aarav Sharma", prn: "PRN20200101" },
    proof: {
      type: "EthereumEip712Signature2021",
      created: new Date().toISOString(),
      proofPurpose: "assertionMethod",
      verificationMethod: "did:ethr:0x1#controller",
      proofValue: "0x123",
      merkleProof: {
        rootHash: "0xabc",
        leafHash: "0xdef",
        batchId: "MGM-2024-BTECH-BATCH01",
        leafIndex: 0,
        siblings: [],
      },
    },
  };
  const genuineReportResult: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: false,
    credentialAuthenticity: "VERIFIED",
    verificationOutcome: "AUTHENTIC",
    verifiedAt: new Date().toISOString(),
    semanticCheck: data1.semantic_check,
  };

  assert(
    computeAcademicInformationStatus(genuineReportResult) === "MATCHED",
    "UI Summary B evaluates to MATCHED for 6/6 verified claims"
  );
  assert(
    computeReportStatus(genuineReportResult) === "VERIFIED",
    "UI Summary A evaluates to VERIFIED"
  );

  const genuineHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: genuineReportResult,
      credential: mockCred,
    })
  );
  assert(
    genuineHtml.includes("Academic Credential Authenticity Confirmed"),
    "UI prominently confirms authenticity for 6/6 matched certificate"
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Negative Test - Altered Candidate Name
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Negative Test: Altered Candidate Name ---");
  const tamperedNameResult: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: true,
    credentialAuthenticity: "INVALID",
    verificationOutcome: "SEMANTIC_MISMATCH",
    diagnosticCode: "CLAIM_MISMATCH_NAME",
    semanticCheck: {
      status: "MISMATCH",
      claimed: {
        studentName: "Vikrant Verma", // Altered!
        prn: "PRN20200101",
        cgpa: 9.24,
        degree: "Bachelor of Technology",
        branch: "Computer Science & Engineering",
        graduationYear: 2024,
      },
      certified: {
        studentName: "Aarav Sharma",
        prn: "PRN20200101",
        cgpa: 9.24,
        degree: "Bachelor of Technology",
        branch: "Computer Science & Engineering",
        graduationYear: 2024,
      },
      field_mismatches: [
        {
          field: "Candidate Name",
          claimed: "Vikrant Verma",
          certified: "Aarav Sharma",
          discrepancy: "Candidate Name mismatch: Document claims 'Vikrant Verma', but certified on-chain record anchors 'Aarav Sharma'.",
        },
      ],
    },
    verifiedAt: new Date().toISOString(),
  };

  assert(
    computeAcademicInformationStatus(tamperedNameResult) === "MISMATCH DETECTED",
    "Altered Candidate Name evaluates to MISMATCH DETECTED"
  );

  const tamperedNameHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: tamperedNameResult,
      credential: mockCred,
    })
  );
  assert(
    tamperedNameHtml.includes("Academic Information Mismatch"),
    "Renders 'Academic Information Mismatch' headline when student name is altered"
  );
  assert(
    tamperedNameHtml.includes("Some academic information does not match the institution"),
    "Renders plain-English explanation of academic data divergence"
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Negative Test - Altered Discipline / Branch
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Negative Test: Altered Discipline / Branch ---");
  const tamperedBranchResult: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: true,
    credentialAuthenticity: "INVALID",
    verificationOutcome: "SEMANTIC_MISMATCH",
    diagnosticCode: "SEMANTIC_CLAIM_MISMATCH",
    semanticCheck: {
      status: "MISMATCH",
      claimed: {
        studentName: "Aarav Sharma",
        prn: "PRN20200101",
        cgpa: 9.24,
        degree: "Bachelor of Technology",
        branch: "Mechanical Engineering", // Altered!
        graduationYear: 2024,
      },
      certified: {
        studentName: "Aarav Sharma",
        prn: "PRN20200101",
        cgpa: 9.24,
        degree: "Bachelor of Technology",
        branch: "Computer Science & Engineering",
        graduationYear: 2024,
      },
      field_mismatches: [
        {
          field: "Branch / Discipline",
          claimed: "Mechanical Engineering",
          certified: "Computer Science & Engineering",
          discrepancy: "Branch mismatch: Document claims 'Mechanical Engineering', but certified record anchors 'Computer Science & Engineering'.",
        },
      ],
    },
    verifiedAt: new Date().toISOString(),
  };

  assert(
    computeAcademicInformationStatus(tamperedBranchResult) === "MISMATCH DETECTED",
    "Altered Discipline evaluates to MISMATCH DETECTED"
  );

  const tamperedBranchHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: tamperedBranchResult,
      credential: mockCred,
    })
  );
  assert(
    tamperedBranchHtml.includes("Academic Information Mismatch"),
    "Renders 'Academic Information Mismatch' headline when discipline is altered"
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Negative Test - Altered CGPA via Real Tampered PDF
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Negative Test: Altered CGPA via Real Tampered PDF ---");
  const tamperedGpaPdfPath = "certificates_pdf/3_Tampered_GPA_Degree_Aarav_Sharma.pdf";
  assert(fs.existsSync(tamperedGpaPdfPath), `Tampered GPA PDF exists at ${tamperedGpaPdfPath}`);

  const tamperedGpaBuffer = fs.readFileSync(tamperedGpaPdfPath);
  const formData4 = new FormData();
  formData4.append("file", new Blob([tamperedGpaBuffer], { type: "application/pdf" }), "3_Tampered_GPA_Degree_Aarav_Sharma.pdf");
  formData4.append("skip_ai", "true");

  const res4 = await fetch("http://localhost:3000/api/verify/pdf?skip_ai=true", {
    method: "POST",
    body: formData4,
  });
  const data4 = await res4.json();

  assert(res4.status === 200, "API returns HTTP 200 with tamper result");
  assert(data4.tamperDetected === true, "API flags tamperDetected: true");
  assert(data4.verification_outcome === "SEMANTIC_MISMATCH", "Outcome is SEMANTIC_MISMATCH");
  assert(data4.diagnostic_code === "CLAIM_MISMATCH_CGPA", "Diagnostic code is CLAIM_MISMATCH_CGPA");
  assert(
    data4.semantic_check?.field_mismatches?.some((m: any) => m.field === "Cumulative CGPA"),
    "Field mismatches accurately identifies Cumulative CGPA (claims 9.92 vs certified 9.24)"
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Negative Test - Missing Document Claims (No Hallucination / Substitution)
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Missing Document Claims - Strict Non-Substitution ---");
  const partialClaimsResult: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: false,
    credentialAuthenticity: "VERIFIED",
    verificationOutcome: "AUTHENTIC",
    semanticCheck: {
      status: "MATCH",
      claimed: {
        studentName: undefined, // Missing from document!
        prn: "PRN20200101",
        cgpa: 9.24,
        degree: "Bachelor of Technology",
        branch: undefined, // Missing from document!
        graduationYear: 2024,
      },
      certified: {
        studentName: "Aarav Sharma",
        prn: "PRN20200101",
        cgpa: 9.24,
        degree: "Bachelor of Technology",
        branch: "Computer Science & Engineering",
        graduationYear: 2024,
      },
      field_mismatches: [],
    },
    verifiedAt: new Date().toISOString(),
  };

  assert(
    computeAcademicInformationStatus(partialClaimsResult) === "PARTIALLY VERIFIED",
    "Missing claims correctly resolve to PARTIALLY VERIFIED (not fabricated as MATCHED)"
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Preserved Revocation & Cryptographic Checks
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Preserved Revocation & Cryptographic Checks ---");
  const revokedPdfPath = "certificates_pdf/5_Revoked_Degree_Pooja_Patil.pdf";
  assert(fs.existsSync(revokedPdfPath), `Revoked PDF exists at ${revokedPdfPath}`);

  const revokedBuffer = fs.readFileSync(revokedPdfPath);
  const formData6 = new FormData();
  formData6.append("file", new Blob([revokedBuffer], { type: "application/pdf" }), "5_Revoked_Degree_Pooja_Patil.pdf");
  formData6.append("skip_ai", "true");

  const res6 = await fetch("http://localhost:3000/api/verify/pdf?skip_ai=true", {
    method: "POST",
    body: formData6,
  });
  const data6 = await res6.json();

  assert(res6.status === 200, "API handles revoked certificate");
  assert(data6.isRevoked === true, "isRevoked is true");
  assert(data6.verification_outcome === "REVOKED", "Outcome is strictly REVOKED");
  assert(data6.semantic_check?.claimed?.studentName === "Pooja Patil", "Extracted studentName 'Pooja Patil' on revoked cert");
  assert(data6.semantic_check?.claimed?.branch === "Electronics & Computer Engineering", "Extracted branch 'Electronics & Computer Engineering' on revoked cert");

  console.log("\n================================================================================");
  console.log(`  Semantic Extraction Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
