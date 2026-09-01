import { ethers } from "ethers";
import MerkleTree from "merkletreejs";
import keccak256 from "keccak256";
import { StudentDegreeData, W3CCredentialPayload, MerkleProofData } from "../types";

/**
 * Normalizes an object into a canonical JSON string with sorted keys
 * to ensure deterministic cryptographic hashing across all platforms.
 */
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`
  );
  return `{${pairs.join(",")}}`;
}

/**
 * Hashes a student's degree data payload to generate a 32-byte Keccak-256 leaf.
 */
export function hashCredentialSubject(subject: StudentDegreeData): string {
  // Normalize fields to prevent minor whitespace / case discrepancies
  const normalized: Record<string, any> = {
    branch: subject.branch.trim(),
    cgpa: Number(Number(subject.cgpa).toFixed(2)),
    degree: subject.degree.trim(),
    fullName: subject.fullName.trim(),
    graduationYear: Number(subject.graduationYear),
    issueDate: subject.issueDate.trim(),
    prn: subject.prn.trim().toUpperCase(),
    university: subject.university.trim(),
  };

  if (subject.nheqfCredits !== undefined) {
    normalized.nheqfCredits = Number(subject.nheqfCredits);
  }
  if (subject.nheqfLevel !== undefined) {
    normalized.nheqfLevel = Number(subject.nheqfLevel);
  }
  if (subject.institutionCode) {
    normalized.institutionCode = subject.institutionCode.trim();
  }

  const canonical = canonicalStringify(normalized);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(canonical));
  return hash;
}

/**
 * Builds a Merkle Tree from an array of student degree records.
 */
export function buildBatchMerkleTree(records: StudentDegreeData[]) {
  const leaves = records.map((record) => {
    const hexHash = hashCredentialSubject(record);
    return Buffer.from(hexHash.slice(2), "hex");
  });

  const tree = new MerkleTree(leaves, keccak256, {
    sortPairs: true,
  });

  const rootHex = "0x" + tree.getRoot().toString("hex");

  const proofs: MerkleProofData[] = records.map((record, index) => {
    const leafBuf = leaves[index];
    const proofBufs = tree.getProof(leafBuf);
    const proofHex = proofBufs.map((p) => "0x" + p.data.toString("hex"));
    const leafHash = "0x" + leafBuf.toString("hex");

    return {
      batchId: "",
      leafIndex: index,
      leafHash,
      rootHash: rootHex,
      proof: proofHex,
      contractAddress: "",
      network: "sepolia",
      chainId: 11155111,
    };
  });

  return {
    tree,
    rootHex,
    leavesHex: leaves.map((l) => "0x" + l.toString("hex")),
    proofs,
  };
}

/**
 * Client-side cryptographic verification of a Merkle Proof.
 */
export function verifyProofClientSide(
  leafHex: string,
  proofHex: string[],
  rootHex: string
): boolean {
  try {
    let computedHash = leafHex.toLowerCase();
    const targetRoot = rootHex.toLowerCase();

    for (const p of proofHex) {
      const proofElement = p.toLowerCase();
      let combined: string;
      if (computedHash <= proofElement) {
        combined = ethers.solidityPacked(
          ["bytes32", "bytes32"],
          [computedHash, proofElement]
        );
      } else {
        combined = ethers.solidityPacked(
          ["bytes32", "bytes32"],
          [proofElement, computedHash]
        );
      }
      computedHash = ethers.keccak256(combined).toLowerCase();
    }

    return computedHash === targetRoot;
  } catch (error) {
    console.error("Proof verification failed:", error);
    return false;
  }
}

/**
 * Builds a full W3C-compliant JSON-LD document with embedded Merkle proof.
 */
export function createW3CCredential(
  subject: StudentDegreeData,
  merkleProof: MerkleProofData,
  issuerAddress: string = "0x71C56538b15294500B73f8472B4fE963D4e58bEf",
  issuerName: string = "MGM University - Examination Authority"
): W3CCredentialPayload {
  return {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://schema.org",
      "https://w3id.org/security/suites/ed25519-2020/v1",
    ],
    id: `urn:uuid:mgm-cert-${subject.prn.toLowerCase()}-${subject.graduationYear}`,
    type: ["VerifiableCredential", "UniversityDegreeCredential"],
    issuer: {
      id: `did:ethr:11155111:${issuerAddress}`,
      name: issuerName,
      url: "https://mgmu.ac.in/academics/verify",
      ethereumAddress: issuerAddress,
    },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      ...subject,
      id: `did:pkh:eip155:11155111:student-${subject.prn.toLowerCase()}`,
    },
    proof: {
      type: "EthereumMerkleProof2024",
      created: new Date().toISOString(),
      verificationMethod: `did:ethr:11155111:${merkleProof.contractAddress}#merkleRoot`,
      merkleProof: {
        ...merkleProof,
      },
    },
  };
}
