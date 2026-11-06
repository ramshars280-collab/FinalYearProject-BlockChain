/**
 * SOET VeriTrust: Public Verification UI Simplification Test Suite
 *
 * Verifies that the public certificate verification results page provides
 * a clean, minimal, non-technical, and professional verification experience:
 * 1. Prominent overall result with plain-English explanation.
 * 2. Three compact verification summary cards:
 *    A. Credential Authenticity (VERIFIED, INVALID, REVOKED, INCONCLUSIVE)
 *    B. Academic Information (MATCHED, MISMATCH DETECTED, PARTIALLY VERIFIED, INCONCLUSIVE)
 *    C. Document Integrity (NO SIGNIFICANT ANOMALIES, REVIEW RECOMMENDED, ANALYSIS INCONCLUSIVE, SERVICE UNAVAILABLE)
 * 3. Compact human-readable certified credential details.
 * 4. No excessive technical details, raw hash dumps, or complex tables cluttering the main view.
 * 5. Preservation of backend cryptographic security.
 */

import React from "react";
import ReactDOMServer from "react-dom/server";
import CredentialVerificationReport, {
  computeReportStatus,
  computeAcademicInformationStatus,
  computeDocumentIntegrityStatus,
} from "../src/components/CredentialVerificationReport";
import { VerificationResult, W3CCredentialPayload } from "../src/types";

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

const mockCredential: W3CCredentialPayload = {
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  id: "urn:uuid:test-credential-simplified-001",
  type: ["VerifiableCredential", "UniversityDegreeCredential"],
  issuer: {
    id: "did:ethr:0x1111111111111111111111111111111111111111",
    name: "MGM University, Chhatrapati Sambhajinagar",
    ethereumAddress: "0x1111111111111111111111111111111111111111",
  },
  issuanceDate: "2024-06-15T10:00:00Z",
  credentialSubject: {
    id: "did:pki:PRN20200101",
    fullName: "Aarav Sharma",
    prn: "PRN20200101",
    degree: "Bachelor of Technology",
    branch: "Computer Science & Engineering",
    cgpa: 9.24,
    graduationYear: 2024,
    issueDate: "2024-06-15",
    university: "MGM University",
  },
  proof: {
    type: "EthereumMerkleProof2024",
    created: "2024-06-15T10:00:00Z",
  },
};

function runSimplificationTestSuite() {
  console.log("================================================================================");
  console.log("  SOET VeriTrust: Public Verification UI Simplification Test Suite");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST 1: Genuine Verified Credential
  // ---------------------------------------------------------------------------
  const genuineResult: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: false,
    credentialAuthenticity: "VERIFIED",
    verificationOutcome: "AUTHENTIC",
    verifiedAt: new Date().toISOString(),
    computedLeaf: "0x1111111111111111111111111111111111111111111111111111111111111111",
    matchedRoot: "0x2222222222222222222222222222222222222222222222222222222222222222",
    issuingInstitutionName: "MGM University",
    forensicScan: {
      status: "COMPLETED",
      assessment: "NO_SIGNIFICANT_ANOMALIES",
      verdict: "NO_SIGNIFICANT_ANOMALIES",
    },
    semanticCheck: {
      status: "MATCH",
      claimed: {
        studentName: "Aarav Sharma",
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
    },
  };

  const genuineHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: genuineResult,
      credential: mockCredential,
    })
  );

  assert(
    computeReportStatus(genuineResult) === "VERIFIED",
    "Scenario 1 (Genuine): Summary A evaluates to VERIFIED"
  );
  assert(
    computeAcademicInformationStatus(genuineResult) === "MATCHED",
    "Scenario 1 (Genuine): Summary B evaluates to MATCHED"
  );
  assert(
    computeDocumentIntegrityStatus(genuineResult) === "NO SIGNIFICANT ANOMALIES",
    "Scenario 1 (Genuine): Summary C evaluates to NO SIGNIFICANT ANOMALIES"
  );
  assert(
    genuineHtml.includes("Academic Credential Authenticity Confirmed") &&
      (genuineHtml.includes("This academic credential matches the institution's registered record.") ||
       genuineHtml.includes("This academic credential matches the institution&#x27;s registered record.")),
    "Scenario 1 (Genuine): Displays prominent overall result and clear plain-English explanation"
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Invalid / Tampered Credential
  // ---------------------------------------------------------------------------
  const invalidResult: VerificationResult = {
    isValid: false,
    isRevoked: false,
    tamperDetected: true,
    diagnosticCode: "MERKLE_PROOF_INVALID",
    tamperReason: "Merkle proof mismatch. Document not found in registry.",
    credentialAuthenticity: "INVALID",
    verificationOutcome: "CRYPTOGRAPHICALLY_INVALID",
    verifiedAt: new Date().toISOString(),
  };

  const invalidHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: invalidResult,
      credential: mockCredential,
    })
  );

  assert(
    computeReportStatus(invalidResult) === "INVALID",
    "Scenario 2 (Invalid): Summary A evaluates to INVALID"
  );
  assert(
    invalidHtml.includes("Cryptographic Verification Failed") &&
      invalidHtml.includes("Merkle proof mismatch"),
    "Scenario 2 (Invalid): Overall result headline and explanation clearly indicate failure"
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Revoked Credential
  // ---------------------------------------------------------------------------
  const revokedResult: VerificationResult = {
    isValid: true,
    isRevoked: true,
    tamperDetected: false,
    credentialAuthenticity: "REVOKED",
    verificationOutcome: "REVOKED",
    verifiedAt: new Date().toISOString(),
  };

  const revokedHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: revokedResult,
      credential: mockCredential,
    })
  );

  assert(
    computeReportStatus(revokedResult) === "REVOKED",
    "Scenario 3 (Revoked): Summary A evaluates to REVOKED"
  );
  assert(
    revokedHtml.includes("Academic Credential Revoked") &&
      revokedHtml.includes("This credential has been revoked by the issuing institution."),
    "Scenario 3 (Revoked): Displays exact revocation title and plain-English explanation"
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Academic Mismatch
  // ---------------------------------------------------------------------------
  const mismatchResult: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: true,
    credentialAuthenticity: "INVALID",
    verificationOutcome: "SEMANTIC_MISMATCH",
    diagnosticCode: "CLAIM_MISMATCH_CGPA",
    semanticCheck: {
      status: "MISMATCH",
      field_mismatches: [
        { field: "cgpa", claimed: 9.95, certified: 9.24, discrepancy: "CGPA inflated" },
      ],
    },
    verifiedAt: new Date().toISOString(),
  };

  const mismatchHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: mismatchResult,
      credential: mockCredential,
    })
  );

  assert(
    computeAcademicInformationStatus(mismatchResult) === "MISMATCH DETECTED",
    "Scenario 4 (Mismatch): Summary B evaluates to MISMATCH DETECTED"
  );
  assert(
    mismatchHtml.includes("Academic Information Mismatch") &&
      (mismatchHtml.includes("Some academic information does not match the institution's registered record.") ||
       mismatchHtml.includes("Some academic information does not match the institution&#x27;s registered record.")),
    "Scenario 4 (Mismatch): Overall headline and explanation clearly report academic data divergence"
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Partial Extraction
  // ---------------------------------------------------------------------------
  const partialResult: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: false,
    credentialAuthenticity: "VERIFIED",
    verificationOutcome: "AUTHENTIC",
    verifiedAt: new Date().toISOString(),
    semanticCheck: {
      status: "MATCH",
      claimed: {
        studentName: "Aarav Sharma",
        prn: "PRN20200101",
        cgpa: 9.24,
      },
      certified: {
        studentName: "Aarav Sharma",
        prn: "PRN20200101",
        cgpa: 9.24,
        degree: "Bachelor of Technology",
        branch: "Computer Science & Engineering",
        graduationYear: 2024,
      },
    },
  };

  const partialHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: partialResult,
      credential: mockCredential,
    })
  );

  assert(
    computeAcademicInformationStatus(partialResult) === "PARTIALLY VERIFIED",
    "Scenario 5 (Partial Extraction): Summary B evaluates to PARTIALLY VERIFIED"
  );
  assert(
    partialHtml.includes("PARTIALLY VERIFIED") && !partialHtml.includes("100% MATCH"),
    "Scenario 5 (Partial Extraction): UI reflects partial verification without claiming complete extraction"
  );

  // ---------------------------------------------------------------------------
  // TEST 6: AI Visual Anomalies Detected
  // ---------------------------------------------------------------------------
  const anomaliesResult: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: false,
    credentialAuthenticity: "VERIFIED",
    verificationOutcome: "AUTHENTIC",
    verifiedAt: new Date().toISOString(),
    forensicScan: {
      status: "COMPLETED",
      assessment: "ANOMALIES_DETECTED",
      verdict: "ANOMALIES_DETECTED",
    },
  };

  const anomaliesHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: anomaliesResult,
      credential: mockCredential,
    })
  );

  assert(
    computeDocumentIntegrityStatus(anomaliesResult) === "REVIEW RECOMMENDED",
    "Scenario 6 (Anomalies): Summary C evaluates to REVIEW RECOMMENDED"
  );
  assert(
    anomaliesHtml.includes("REVIEW RECOMMENDED") &&
      anomaliesHtml.includes(
        "The submitted document contains unusual visual patterns that may require further inspection. This does not independently establish forgery."
      ),
    "Scenario 6 (Anomalies): Displays exact required non-accusatory review disclaimer"
  );

  // ---------------------------------------------------------------------------
  // TEST 7: AI Service Unavailable
  // ---------------------------------------------------------------------------
  const offlineResult: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: false,
    credentialAuthenticity: "VERIFIED",
    verificationOutcome: "AUTHENTIC",
    visualServiceOffline: true,
    forensicScan: {
      status: "UNAVAILABLE",
      reason: "microservice offline",
    },
    verifiedAt: new Date().toISOString(),
  };

  const offlineHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: offlineResult,
      credential: mockCredential,
    })
  );

  assert(
    computeDocumentIntegrityStatus(offlineResult) === "SERVICE UNAVAILABLE",
    "Scenario 7 (AI Offline): Summary C evaluates to SERVICE UNAVAILABLE"
  );
  assert(
    computeReportStatus(offlineResult) === "VERIFIED",
    "Scenario 7 (AI Offline): Cryptographic credential authenticity remains VERIFIED"
  );
  assert(
    offlineHtml.includes("SERVICE UNAVAILABLE"),
    "Scenario 7 (AI Offline): Renders clean SERVICE UNAVAILABLE indicator"
  );

  console.log("\n================================================================================");
  console.log(`  UI Simplification Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runSimplificationTestSuite();
