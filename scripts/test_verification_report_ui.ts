/**
 * SOET VeriTrust: Verification UI Improvement Test Suite
 * Tests the Credential Verification Report and ensures the full certificate is removed
 * from public verification workflows while preserving issuer and student viewing.
 */

import fs from "fs";
import path from "path";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  maskPRN,
  computeReportStatus,
  ReportStatus,
} from "../src/components/CredentialVerificationReport";
import CredentialVerificationReport from "../src/components/CredentialVerificationReport";
import { VerificationResult, W3CCredentialPayload } from "../src/types";

console.log("================================================================================");
console.log("  SOET VeriTrust: Public Credential Verification Report Test Suite");
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

// Sample Mock Credential
const mockCredential: W3CCredentialPayload = {
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  id: "urn:uuid:credential-test-001",
  type: ["VerifiableCredential", "UniversityDegreeCredential"],
  issuer: {
    name: "MGM University, Chhatrapati Sambhajinagar",
    ethereumAddress: "0x71c56538b15294500b73F8472B4fe963D4e58Bef",
    institutionCode: "MGMU-ENG-01",
  },
  issuanceDate: "2024-06-15T10:00:00Z",
  credentialSubject: {
    fullName: "Aarav Sharma",
    prn: "PRN20200101",
    degree: "Bachelor of Technology",
    branch: "Computer Science & Engineering",
    cgpa: 9.24,
    graduationYear: 2024,
    issueDate: "2024-06-15",
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
  },
  proof: {
    type: "EthereumMerkleProof2024",
    created: "2024-06-15T10:00:00Z",
    merkleProof: {
      batchId: "MGM-2024-BTECH-BATCH01",
      leafIndex: 0,
      leafHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      rootHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      proof: [],
      contractAddress: "0x376c6aeEa480D99d63c5598696F26e0339dE1cE9",
      network: "Ethereum Sepolia",
    },
  },
};

async function runTests() {
  // ---------------------------------------------------------------------------
  // REQUIREMENT 1: Masked PRN Logic & Academic Privacy
  // ---------------------------------------------------------------------------
  assert(
    maskPRN("PRN20200101") === "PRN••••0101",
    "Privacy Masking: PRN20200101 correctly masked as PRN••••0101"
  );
  assert(
    maskPRN("DEMO-CSE-001") === "DEM••••001",
    "Privacy Masking: DEMO-CSE-001 correctly masked as DEM••••001"
  );
  assert(
    maskPRN("PRN20240051") === "PRN••••0051",
    "Privacy Masking: PRN20240051 correctly masked as PRN••••0051"
  );
  assert(
    maskPRN("") === "••••••••" && maskPRN(null) === "••••••••",
    "Privacy Masking: Empty/null PRN safely returns fallback dots"
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 2: Status Computation (VERIFIED, INVALID, REVOKED, INCONCLUSIVE)
  // ---------------------------------------------------------------------------
  const verifiedResult: VerificationResult = {
    isValid: true,
    isRevoked: false,
    tamperDetected: false,
    verificationOutcome: "AUTHENTIC",
    diagnosticCode: "FULLY_VERIFIED",
    verifiedAt: "10:00:00 AM",
    isOnChainAnchored: true,
    batchId: "MGM-2024-BTECH-BATCH01",
    leafIndex: 0,
  };
  assert(
    computeReportStatus(verifiedResult) === "VERIFIED",
    "Status Computation: Authentic credential resolves to VERIFIED status"
  );

  const invalidResult: VerificationResult = {
    isValid: false,
    isRevoked: false,
    tamperDetected: true,
    tamperReason: "Merkle proof mismatch",
    verificationOutcome: "CRYPTOGRAPHICALLY_INVALID",
    diagnosticCode: "MERKLE_PROOF_INVALID",
    verifiedAt: "10:00:00 AM",
  };
  assert(
    computeReportStatus(invalidResult) === "INVALID",
    "Status Computation: Tampered/mismatched credential resolves to INVALID status"
  );

  const revokedResult: VerificationResult = {
    isValid: false,
    isRevoked: true,
    tamperDetected: false,
    verificationOutcome: "REVOKED",
    diagnosticCode: "CREDENTIAL_REVOKED",
    verifiedAt: "10:00:00 AM",
    batchId: "MGM-2024-BTECH-BATCH01",
    leafIndex: 0,
  };
  assert(
    computeReportStatus(revokedResult) === "REVOKED",
    "Status Computation: Revoked credential resolves to REVOKED status"
  );

  const inconclusiveResult: VerificationResult = {
    isValid: false,
    isRevoked: false,
    tamperDetected: false,
    verificationOutcome: "INCONCLUSIVE",
    diagnosticCode: "SCANNED_DOCUMENT_REQUIRES_OCR",
    verifiedAt: "10:00:00 AM",
  };
  assert(
    computeReportStatus(inconclusiveResult) === "INCONCLUSIVE",
    "Status Computation: Scanned unreadable document resolves to INCONCLUSIVE status (never VERIFIED)"
  );

  const unanchoredResult: VerificationResult = {
    isValid: false,
    isRevoked: false,
    tamperDetected: false,
    verificationOutcome: "INCONCLUSIVE",
    diagnosticCode: "RECORD_NOT_IN_DATABASE",
    verifiedAt: "10:00:00 AM",
  };
  assert(
    computeReportStatus(unanchoredResult) === "INCONCLUSIVE",
    "Status Computation: Unregistered/unanchored document resolves to INCONCLUSIVE status"
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 3: Static Inspection of DropzoneVerifier.tsx
  // ---------------------------------------------------------------------------
  const dropzonePath = path.join(process.cwd(), "src/components/DropzoneVerifier.tsx");
  const dropzoneContent = fs.readFileSync(dropzonePath, "utf-8");

  assert(
    !dropzoneContent.includes("import DegreeCertificate from \"./DegreeCertificate\""),
    "DropzoneVerifier Clean: DegreeCertificate import completely removed from DropzoneVerifier"
  );
  assert(
    !dropzoneContent.includes("<DegreeCertificate"),
    "DropzoneVerifier Clean: <DegreeCertificate> JSX element completely removed from DropzoneVerifier"
  );
  assert(
    dropzoneContent.includes("import CredentialVerificationReport from \"./CredentialVerificationReport\""),
    "DropzoneVerifier Integration: CredentialVerificationReport imported into DropzoneVerifier"
  );
  assert(
    dropzoneContent.includes("<CredentialVerificationReport"),
    "DropzoneVerifier Integration: <CredentialVerificationReport> rendered upon verification result"
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 4: Static Inspection of Preserved Authorized Portals
  // ---------------------------------------------------------------------------
  const studentPagePath = path.join(process.cwd(), "src/app/student/page.tsx");
  const studentPageContent = fs.readFileSync(studentPagePath, "utf-8");
  assert(
    studentPageContent.includes("import DegreeCertificate from \"../../components/DegreeCertificate\"") &&
    studentPageContent.includes("<DegreeCertificate"),
    "Preserved Student Vault: Student portal retains <DegreeCertificate> for personal credential viewing"
  );

  const issuerListPath = path.join(process.cwd(), "src/components/IssuerCertificatesList.tsx");
  const issuerListContent = fs.readFileSync(issuerListPath, "utf-8");
  assert(
    issuerListContent.includes("import DegreeCertificate from \"./DegreeCertificate\"") &&
    issuerListContent.includes("<DegreeCertificate"),
    "Preserved Issuer Management: Issuer modal retains <DegreeCertificate> for official administrative preview"
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 5: HTML Rendering of Successfully Verified Credential
  // ---------------------------------------------------------------------------
  const verifiedHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: {
        ...verifiedResult,
        computedLeaf: "0x1111111111111111111111111111111111111111111111111111111111111111",
        matchedRoot: "0x2222222222222222222222222222222222222222222222222222222222222222",
        issuingInstitutionName: "MGM University, Chhatrapati Sambhajinagar",
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
        forensicScan: {
          status: "COMPLETED",
          verdict: "LOW ANOMALY",
          ai_confidence_score: 0.12,
          metadata: {
            anomaly_std_dev: "0.042",
            localized_tile_peak_zscore: "1.45",
            compute_device: "CPU",
          },
        },
      },
      credential: mockCredential,
    })
  );

  assert(
    verifiedHtml.includes("VERIFIED") &&
    verifiedHtml.includes("Academic Credential Authenticity Confirmed"),
    "Report Render (Verified): Displays prominent VERIFIED status and authenticity confirmation"
  );
  assert(
    verifiedHtml.includes("Aarav Sharma") &&
    verifiedHtml.includes("Bachelor of Technology") &&
    verifiedHtml.includes("MGM University"),
    "Report Render (Verified): Contains student name, degree, and issuing institution"
  );
  assert(
    verifiedHtml.includes("PRN••••0101"),
    "Report Render (Verified): Displays masked PRN (PRN••••0101) instead of raw student identifier"
  );
  assert(
    !verifiedHtml.includes("printable-degree") &&
    !verifiedHtml.includes("Vice-Chancellor") &&
    !verifiedHtml.includes("Chancellor") &&
    !verifiedHtml.includes("Hologram"),
    "Report Render (Verified): No full certificate document (#printable-degree), ornate seals, or signatures rendered"
  );
  assert(
    verifiedHtml.includes("Blockchain &amp; Cryptographic Verification") &&
    verifiedHtml.includes("Semantic Verification") &&
    verifiedHtml.includes("AI Forensic Analysis"),
    "Report Render (Verified): Contains all required verification audit sections"
  );
  assert(
    verifiedHtml.includes("12.0%") &&
    verifiedHtml.includes("LOW ANOMALY"),
    "Report Render (Verified): Displays genuine AI risk score and low anomaly verdict"
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 6: HTML Rendering of Invalid / Tampered Credential
  // ---------------------------------------------------------------------------
  const invalidHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: {
        ...invalidResult,
        computedLeaf: "0xdeadbeef11111111111111111111111111111111111111111111111111111111",
        matchedRoot: "0x2222222222222222222222222222222222222222222222222222222222222222",
      },
      credential: mockCredential,
    })
  );

  assert(
    invalidHtml.includes("INVALID") &&
    invalidHtml.includes("Cryptographic Verification Failed"),
    "Report Render (Invalid): Displays prominent INVALID status and failure heading"
  );
  assert(
    invalidHtml.includes("Merkle proof mismatch"),
    "Report Render (Invalid): Communicates clear tamper/mismatch explanation"
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 7: HTML Rendering of Revoked Credential
  // ---------------------------------------------------------------------------
  const revokedHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: {
        ...revokedResult,
      },
      credential: mockCredential,
    })
  );

  assert(
    revokedHtml.includes("REVOKED") &&
    revokedHtml.includes("Academic Credential Revoked"),
    "Report Render (Revoked): Displays prominent REVOKED status"
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 8: HTML Rendering of Inconclusive Verification
  // ---------------------------------------------------------------------------
  const inconclusiveHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: {
        ...inconclusiveResult,
        tamperReason: "Scanned Document Detected: OCR did not detect readable text.",
      },
    })
  );

  assert(
    inconclusiveHtml.includes("INCONCLUSIVE") &&
    !inconclusiveHtml.includes("STATUS: VERIFIED"),
    "Report Render (Inconclusive): Displays INCONCLUSIVE status and never misleadingly claims VERIFIED"
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 9: Accurate Communication of AI Microservice Offline
  // ---------------------------------------------------------------------------
  const offlineAiHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(CredentialVerificationReport, {
      result: {
        ...verifiedResult,
        visualServiceOffline: true,
        forensicScan: {
          status: "UNAVAILABLE",
          reason: "AI microservice offline (connection refused)",
        },
      },
      credential: mockCredential,
    })
  );

  assert(
    offlineAiHtml.includes("AI Forensic Service Offline") ||
    offlineAiHtml.includes("Service Offline / Unavailable"),
    "Report Render (AI Offline): Accurately communicates that AI forensic microservice is offline"
  );
  assert(
    offlineAiHtml.includes("Authoritative on-chain cryptographic") ||
    offlineAiHtml.includes("completed independently"),
    "Report Render (AI Offline): Reassures user that independent cryptographic verification remains authoritative"
  );

  // ---------------------------------------------------------------------------
  // REQUIREMENT 10: Mobile Responsive Design & Overflow Protection
  // ---------------------------------------------------------------------------
  const reportCodePath = path.join(process.cwd(), "src/components/CredentialVerificationReport.tsx");
  const reportCode = fs.readFileSync(reportCodePath, "utf-8");

  assert(
    reportCode.includes("overflow-x-auto"),
    "Mobile Responsive: Audit table wrapped in overflow-x-auto to prevent mobile horizontal cutoff"
  );
  assert(
    !reportCode.includes("w-[") || !reportCode.match(/w-\[\d{3,4}px\]/),
    "Mobile Responsive: No hardcoded fixed-pixel container widths that trigger mobile horizontal overflow"
  );
  assert(
    reportCode.includes("w-full") &&
    reportCode.includes("max-w-4xl") &&
    reportCode.includes("grid-cols-1"),
    "Mobile Responsive: Fluid widths and responsive multi-tier grids (grid-cols-1 sm:grid-cols-2) implemented"
  );

  console.log("\n================================================================================");
  console.log(`  Credential Verification Report Test Results: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
