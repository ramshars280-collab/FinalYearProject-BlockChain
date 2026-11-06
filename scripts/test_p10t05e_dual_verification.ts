/**
 * SOET VeriTrust: P10-T05E Dual Verification Decision Architecture Regression Suite
 *
 * Verifies that Cryptographic Credential Authenticity and Document Forensic Assessment
 * are strictly independent dimensions, ensuring genuine credentials with compression artifacts
 * are never labelled suspicious or forged.
 *
 * Scenarios Tested:
 * 1. Authentic credential with no ELA anomalies -> VERIFIED + NO_SIGNIFICANT_ANOMALIES
 * 2. Authentic credential with ELA anomalies -> VERIFIED + ANOMALIES_DETECTED (P10-T05E Core Case)
 * 3. Tampered image with successful blockchain proof -> INVALID (tamperDetected / semantic mismatch)
 * 4. Invalid Merkle proof -> INVALID
 * 5. Revoked credential -> REVOKED
 * 6. Semantic mismatch -> INVALID
 * 7. Missing extracted fields -> Inconclusive fields counted; never falsely claims "100% Match"
 * 8. AI unavailable -> SERVICE_UNAVAILABLE; Cryptographic VERIFIED unaffected
 * 9. AI timeout -> SERVICE_UNAVAILABLE; Cryptographic VERIFIED unaffected
 */

import React from "react";
import ReactDOMServer from "react-dom/server";
import CredentialVerificationReport, {
  computeReportStatus,
  computeCredentialAuthenticityStatus,
  computeDocumentForensicAssessment,
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
  id: "urn:uuid:test-credential-001",
  type: ["VerifiableCredential", "UniversityDegreeCredential"],
  issuer: {
    id: "did:ethr:0x1111111111111111111111111111111111111111",
    name: "MGM University",
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

function runRegressionSuite() {
  console.log("================================================================================");
  console.log("  SOET VeriTrust: P10-T05E Dual Verification Decision Architecture Regression Suite");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST 1: Authentic credential with no ELA anomalies
  // ---------------------------------------------------------------------------
  const case1Result: VerificationResult = {
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
      ai_confidence_score: 0.12,
      metadata: {
        anomaly_std_dev: 0.042,
        localized_tile_peak_zscore: 1.25,
      },
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

  const case1Status = computeReportStatus(case1Result);
  const case1Assessment = computeDocumentForensicAssessment(case1Result);
  assert(
    case1Status === "VERIFIED" && case1Assessment === "NO_SIGNIFICANT_ANOMALIES",
    "Scenario 1: Authentic credential with clean ELA resolves to VERIFIED + NO_SIGNIFICANT_ANOMALIES"
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Authentic credential with ELA anomalies (The P10-T05E core problem!)
  // ---------------------------------------------------------------------------
  const case2Result: VerificationResult = {
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
      assessment: "ANOMALIES_DETECTED",
      verdict: "ANOMALIES_DETECTED",
      ai_confidence_score: 0.38,
      metadata: {
        anomaly_std_dev: 2.15,
        localized_tile_peak_zscore: 4.82,
        localized_suspicious_regions: [
          { grid_row: 2, grid_col: 3, z_score: 4.82, tile_mean: 18.2 },
          { grid_row: 5, grid_col: 6, z_score: 3.95, tile_mean: 15.6 },
        ],
      },
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

  const case2Status = computeReportStatus(case2Result);
  const case2Assessment = computeDocumentForensicAssessment(case2Result);
  const case2Html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: case2Result,
      credential: mockCredential,
    })
  );

  assert(
    case2Status === "VERIFIED",
    "Scenario 2: Authentic credential with ELA anomalies PRESERVES CREDENTIAL AUTHENTICITY: VERIFIED"
  );
  assert(
    case2Assessment === "ANOMALIES_DETECTED",
    "Scenario 2: ELA anomalies correctly classify as DOCUMENT FORENSIC ASSESSMENT: ANOMALIES_DETECTED"
  );
  assert(
    !case2Html.includes("VERDICT: SUSPICIOUS") && !case2Html.includes("VERDICT SUSPICIOUS"),
    "Scenario 2: Report never contains definitive 'VERDICT: SUSPICIOUS' for genuine certificate"
  );
  assert(
    case2Html.includes("Unusual compression patterns detected. Manual document inspection is recommended. These findings alone do not establish forgery."),
    "Scenario 2: Displays exact required ELA anomaly advisory disclaimer"
  );
  assert(
    case2Html.includes("ANOMALIES DETECTED — REVIEW RECOMMENDED"),
    "Scenario 2: Renders amber non-accusatory warning badge for detected anomalies"
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Tampered image with successful blockchain proof
  // ---------------------------------------------------------------------------
  const case3Result: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: true,
    tamperReason: "Visual claim mismatch detected between rasterized image and certified record",
    credentialAuthenticity: "INVALID",
    verificationOutcome: "SEMANTIC_MISMATCH",
    verifiedAt: new Date().toISOString(),
  };
  assert(
    computeReportStatus(case3Result) === "INVALID",
    "Scenario 3: Tampered document with successful blockchain proof resolves to INVALID"
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Invalid Merkle proof
  // ---------------------------------------------------------------------------
  const case4Result: VerificationResult = {
    isValid: false,
    isRevoked: false,
    tamperDetected: true,
    diagnosticCode: "MERKLE_PROOF_INVALID",
    credentialAuthenticity: "INVALID",
    verificationOutcome: "CRYPTOGRAPHICALLY_INVALID",
    verifiedAt: new Date().toISOString(),
  };
  assert(
    computeReportStatus(case4Result) === "INVALID",
    "Scenario 4: Cryptographically invalid Merkle proof strictly resolves to INVALID"
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Revoked credential
  // ---------------------------------------------------------------------------
  const case5Result: VerificationResult = {
    isValid: true,
    isRevoked: true,
    tamperDetected: false,
    credentialAuthenticity: "REVOKED",
    verificationOutcome: "REVOKED",
    verifiedAt: new Date().toISOString(),
  };
  assert(
    computeReportStatus(case5Result) === "REVOKED",
    "Scenario 5: Revoked credential strictly resolves to REVOKED"
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Semantic mismatch
  // ---------------------------------------------------------------------------
  const case6Result: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: true,
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
  assert(
    computeReportStatus(case6Result) === "INVALID",
    "Scenario 6: Confirmed semantic mismatch resolves to INVALID"
  );

  // ---------------------------------------------------------------------------
  // TEST 7: Missing extracted fields (Semantic aggregation accuracy)
  // ---------------------------------------------------------------------------
  const case7Result: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: false,
    credentialAuthenticity: "VERIFIED",
    verificationOutcome: "AUTHENTIC",
    verifiedAt: new Date().toISOString(),
    semanticCheck: {
      status: "MATCH",
      // Only 3 of 6 fields extracted from PDF
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
  const case7Html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: case7Result,
      credential: mockCredential,
    })
  );
  assert(
    !case7Html.includes("100% MATCH"),
    "Scenario 7: Semantic aggregation does not claim '100% MATCH' when fields are unextracted"
  );
  assert(
    case7Html.includes("3 OF 6 CLAIMS VERIFIED") && case7Html.includes("3 INCONCLUSIVE"),
    "Scenario 7: Semantic audit accurately details '3 OF 6 CLAIMS VERIFIED (3 INCONCLUSIVE)'"
  );

  // ---------------------------------------------------------------------------
  // TEST 8: AI unavailable
  // ---------------------------------------------------------------------------
  const case8Result: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: false,
    credentialAuthenticity: "VERIFIED",
    verificationOutcome: "AUTHENTIC",
    verifiedAt: new Date().toISOString(),
    visualServiceOffline: true,
    forensicScan: {
      status: "UNAVAILABLE",
      reason: "microservice offline",
    },
  };
  assert(
    computeReportStatus(case8Result) === "VERIFIED",
    "Scenario 8: Cryptographic verification remains VERIFIED when AI is unavailable"
  );
  assert(
    computeDocumentForensicAssessment(case8Result) === "SERVICE_UNAVAILABLE",
    "Scenario 8: Document Forensic Assessment reports SERVICE_UNAVAILABLE"
  );

  // ---------------------------------------------------------------------------
  // TEST 9: AI timeout
  // ---------------------------------------------------------------------------
  const case9Result: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: false,
    credentialAuthenticity: "VERIFIED",
    verificationOutcome: "AUTHENTIC",
    verifiedAt: new Date().toISOString(),
    forensicScan: {
      status: "UNAVAILABLE",
      reason: "AI forensic service unavailable (cold-start timeout exceeded).",
    },
  };
  assert(
    computeReportStatus(case9Result) === "VERIFIED",
    "Scenario 9: Cryptographic verification remains VERIFIED when AI times out"
  );
  assert(
    computeDocumentForensicAssessment(case9Result) === "SERVICE_UNAVAILABLE",
    "Scenario 9: Document Forensic Assessment reports SERVICE_UNAVAILABLE upon timeout"
  );

  console.log("\n================================================================================");
  console.log(`  P10-T05E Dual Verification Regression Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuite();
