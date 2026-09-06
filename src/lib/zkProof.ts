import { ethers } from "ethers";
import { StudentDegreeData, W3CCredentialPayload, SelectiveDisclosureProof, BatchRecord } from "../types";
import { canonicalStringify } from "./crypto";

/**
 * Generates a DPDP Act-compliant Selective Disclosure credential.
 * Allows a student to cryptographically prove assertions (e.g., CGPA >= 7.5)
 * or selectively disclose certain fields while redacting others.
 */
export function generateSelectiveDisclosureProof(
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

  const selectiveProof: SelectiveDisclosureProof = {
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
      "https://w3id.org/security/suites/selective-disclosure/v1",
    ],
    id: `urn:uuid:selective-disclosure-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    type: ["VerifiableCredential", "SelectiveDisclosureCredential"],
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
      type: "SelectiveDisclosureProof2024",
      created: new Date().toISOString(),
      verificationMethod: originalCredential.proof.verificationMethod,
      zkProof: selectiveProof,
      selectiveProof,
      merkleProof: originalCredential.proof.merkleProof,
    },
  };

  return selectiveCredential;
}

export const generateZkSelectiveProof = generateSelectiveDisclosureProof;

/**
 * Validates a Selective Disclosure proof against real stored batch records.
 * Re-derives the commitment from authentic data rather than trusting self-reported values.
 */
export async function verifyZkSelectiveProof(credential: W3CCredentialPayload): Promise<{
  isValid: boolean;
  message: string;
  threshold?: number | string;
  assertionType?: string;
  actualCgpa?: number;
}> {
  const proof = credential.proof?.selectiveProof || credential.proof?.zkProof;
  if (!proof) {
    return { isValid: false, message: "Missing Selective Disclosure proof payload" };
  }

  const merkleProof = credential.proof?.merkleProof;
  if (!merkleProof || !merkleProof.batchId) {
    return { isValid: false, message: "Missing anchored batch metadata in selective disclosure credential" };
  }

  // 1. Fetch real batch from database (via API in browser, or directly in server environment)
  let batch: BatchRecord | null = null;
  if (typeof window === "undefined") {
    const { getBatchByIdDb } = await import("./db");
    batch = getBatchByIdDb(merkleProof.batchId);
  } else {
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(merkleProof.batchId)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.batch) {
          batch = data.batch;
        }
      } else if (res.status === 404) {
        return {
          isValid: false,
          message: `Batch "${merkleProof.batchId}" not found in institutional batch registry`,
        };
      } else {
        return {
          isValid: false,
          message: `Verification server error (${res.status}) while retrieving batch "${merkleProof.batchId}"`,
        };
      }
    } catch (err: any) {
      return {
        isValid: false,
        message: `Network error retrieving batch "${merkleProof.batchId}": ${err?.message || "Failed to connect to verification server"}`,
      };
    }
  }

  if (!batch) {
    return {
      isValid: false,
      message: `Batch "${merkleProof.batchId}" not found in institutional batch registry`,
    };
  }

  // 2. Verify on-chain/stored Merkle root consistency
  if (batch.merkleRoot.toLowerCase() !== (merkleProof.rootHash || "").toLowerCase()) {
    return {
      isValid: false,
      message: "Merkle root in proof does not match the anchored batch root",
    };
  }

  // 3. Locate the genuine student record in the real batch
  let realRecord: StudentDegreeData | undefined;

  // Try by leafIndex first if valid
  if (typeof merkleProof.leafIndex === "number" && batch.records[merkleProof.leafIndex]) {
    const candidate = batch.records[merkleProof.leafIndex];
    // Verify candidate matches commitment
    const testCommitment = ethers.keccak256(
      ethers.toUtf8Bytes(
        canonicalStringify({
          rootHash: batch.merkleRoot,
          prnHash: ethers.keccak256(ethers.toUtf8Bytes(candidate.prn)),
          cgpa: candidate.cgpa,
          threshold: proof.thresholdValue,
          salt: proof.salt,
        })
      )
    );
    if (testCommitment.toLowerCase() === proof.commitmentHash.toLowerCase()) {
      realRecord = candidate;
    }
  }

  // If not found by leafIndex, search all batch records for the matching commitment
  if (!realRecord) {
    for (const record of batch.records) {
      const testCommitment = ethers.keccak256(
        ethers.toUtf8Bytes(
          canonicalStringify({
            rootHash: batch.merkleRoot,
            prnHash: ethers.keccak256(ethers.toUtf8Bytes(record.prn)),
            cgpa: record.cgpa,
            threshold: proof.thresholdValue,
            salt: proof.salt,
          })
        )
      );
      if (testCommitment.toLowerCase() === proof.commitmentHash.toLowerCase()) {
        realRecord = record;
        break;
      }
    }
  }

  if (!realRecord) {
    return {
      isValid: false,
      message: "Cryptographic commitment failure: No authentic student record in this batch corresponds to this commitment",
    };
  }

  // 4. Re-derive commitment from the authentic record to ensure zero tampering
  const expectedCommitment = ethers.keccak256(
    ethers.toUtf8Bytes(
      canonicalStringify({
        rootHash: batch.merkleRoot,
        prnHash: ethers.keccak256(ethers.toUtf8Bytes(realRecord.prn)),
        cgpa: realRecord.cgpa,
        threshold: proof.thresholdValue,
        salt: proof.salt,
      })
    )
  );

  if (expectedCommitment.toLowerCase() !== proof.commitmentHash.toLowerCase()) {
    return {
      isValid: false,
      message: "Selective disclosure commitment hash mismatch with authentic institutional record",
    };
  }

  // 5. Evaluate the predicate against the REAL CGPA from the stored batch record
  const realCgpa = Number(realRecord.cgpa);
  const threshold = Number(proof.thresholdValue);
  let satisfies = false;

  switch (proof.assertionType) {
    case "GTE":
      satisfies = realCgpa >= threshold;
      break;
    case "LTE":
      satisfies = realCgpa <= threshold;
      break;
    case "EQUALS":
      satisfies = realCgpa === threshold;
      break;
    default:
      satisfies = realCgpa >= threshold;
  }

  if (!satisfies) {
    return {
      isValid: false,
      message: `Predicate failed: Actual CGPA (${realCgpa}) does not satisfy "${proof.attributeName} ${proof.assertionType} ${threshold}" in authentic batch record`,
      threshold: proof.thresholdValue,
      assertionType: proof.assertionType,
      actualCgpa: realCgpa,
    };
  }

  // 6. Verify proof hash integrity with verified actual satisfaction state
  const expectedProofHash = ethers.keccak256(
    ethers.toUtf8Bytes(`${proof.commitmentHash}:${proof.thresholdValue}:${satisfies}`)
  );

  if (expectedProofHash.toLowerCase() !== proof.proofHash.toLowerCase()) {
    return {
      isValid: false,
      message: "Cryptographic proof hash verification failed",
    };
  }

  return {
    isValid: true,
    message: `Verified: ${proof.attributeName.toUpperCase()} ${proof.assertionType} ${proof.thresholdValue} against authentic batch "${batch.batchId}" (DPDP Selective Disclosure Standard)`,
    threshold: proof.thresholdValue,
    assertionType: proof.assertionType,
    actualCgpa: realCgpa,
  };
}

export const verifySelectiveDisclosureProof = verifyZkSelectiveProof;
