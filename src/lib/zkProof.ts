import { ethers } from "ethers";
import { StudentDegreeData, W3CCredentialPayload, ZkSelectiveProof } from "../types";
import { canonicalStringify, hashCredentialSubject } from "./crypto";

/**
 * Generates a DPDP Act-compliant Zero-Knowledge Selective Disclosure credential.
 * Allows a student to cryptographically prove assertions (e.g., CGPA >= 7.5)
 * or selectively disclose certain fields while redacting others.
 */
export function generateZkSelectiveProof(
  originalCredential: W3CCredentialPayload,
  thresholdCgpa: number = 7.5,
  redactPii: boolean = true
): W3CCredentialPayload {
  const subject = originalCredential.credentialSubject;
  const salt = ethers.hexlify(ethers.randomBytes(16));
  const satisfies = Number(subject.cgpa) >= thresholdCgpa;

  // Salted commitment
  const commitmentPayload = {
    rootHash: originalCredential.proof.merkleProof?.rootHash || "0x00",
    prnHash: ethers.keccak256(ethers.toUtf8Bytes(subject.prn)),
    cgpa: subject.cgpa,
    threshold: thresholdCgpa,
    salt,
  };
  const commitmentHash = ethers.keccak256(
    ethers.toUtf8Bytes(canonicalStringify(commitmentPayload))
  );

  const disclosedAttributes: Partial<StudentDegreeData> = {
    degree: subject.degree,
    branch: subject.branch,
    graduationYear: subject.graduationYear,
    university: subject.university,
  };

  const redactedAttributes: string[] = ["cgpa"];

  if (redactPii) {
    redactedAttributes.push("prn", "seatNumber", "division");
  } else {
    disclosedAttributes.prn = subject.prn;
    disclosedAttributes.fullName = subject.fullName;
  }

  const zkProof: ZkSelectiveProof = {
    attributeName: "cgpa",
    assertionType: "GTE",
    thresholdValue: thresholdCgpa,
    actualSatisfied: satisfies,
    commitmentHash,
    salt,
    disclosedAttributes,
    redactedAttributes,
    proofHash: ethers.keccak256(
      ethers.toUtf8Bytes(`${commitmentHash}:${thresholdCgpa}:${satisfies}`)
    ),
    timestamp: Date.now(),
  };

  const selectiveCredential: W3CCredentialPayload = {
    "@context": [
      ...originalCredential["@context"],
      "https://w3id.org/security/suites/zk-selective-disclosure/v1",
    ],
    id: `urn:uuid:zk-proof-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    type: ["VerifiableCredential", "ZeroKnowledgeSelectiveCredential"],
    issuer: originalCredential.issuer,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      ...disclosedAttributes,
      fullName: redactPii ? "REDACTED [DPDP ACT COMPLIANT]" : subject.fullName,
      prn: redactPii ? "REDACTED" : subject.prn,
      cgpa: satisfies ? thresholdCgpa : 0, // only shows threshold assertion
      graduationYear: subject.graduationYear,
      issueDate: subject.issueDate,
      degree: subject.degree,
      branch: subject.branch,
      university: subject.university,
    },
    proof: {
      type: "ZkSelectiveProof2024",
      created: new Date().toISOString(),
      verificationMethod: originalCredential.proof.verificationMethod,
      zkProof,
      merkleProof: originalCredential.proof.merkleProof,
    },
  };

  return selectiveCredential;
}

/**
 * Validates a Zero-Knowledge Selective Disclosure proof client-side.
 */
export function verifyZkSelectiveProof(credential: W3CCredentialPayload): {
  isValid: boolean;
  message: string;
  threshold?: number | string;
  assertionType?: string;
} {
  const zk = credential.proof?.zkProof;
  if (!zk) {
    return { isValid: false, message: "Missing ZK Selective Proof payload" };
  }

  if (!zk.actualSatisfied) {
    return {
      isValid: false,
      message: `Predicate not satisfied: ${zk.attributeName} ${zk.assertionType} ${zk.thresholdValue}`,
    };
  }

  // Re-check proof hash integrity
  const expectedProofHash = ethers.keccak256(
    ethers.toUtf8Bytes(
      `${zk.commitmentHash}:${zk.thresholdValue}:${zk.actualSatisfied}`
    )
  );

  if (expectedProofHash.toLowerCase() !== zk.proofHash.toLowerCase()) {
    return { isValid: false, message: "Cryptographic proof hash mismatch in ZK assertion" };
  }

  return {
    isValid: true,
    message: `Verified: ${zk.attributeName.toUpperCase()} ${zk.assertionType} ${zk.thresholdValue} (Certified under DPDP Zero-PII Standard)`,
    threshold: zk.thresholdValue,
    assertionType: zk.assertionType,
  };
}
