import { ethers } from "ethers";
import MerkleTree from "merkletreejs";
import keccak256 from "keccak256";
import { StudentDegreeData, W3CCredentialPayload, MerkleProofData } from "../types";

/**
 * Masks a blockchain address or hash for UI privacy protection (DPDP compliant)
 */
export function maskAddress(address?: string | null): string {
  if (!address) return "0x****...****";
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}••••${address.slice(-4)}`;
}

export function maskHash(hash?: string | null): string {
  if (!hash) return "0x••••••••";
  if (hash.length < 16) return hash;
  return `${hash.slice(0, 10)}••••••••${hash.slice(-8)}`;
}

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
  const prn = (subject.prn || (subject as any).PRN || "").toString().trim().toUpperCase();
  const fullName = (subject.fullName || (subject as any).name || "").toString().trim();
  const branch = (subject.branch || "").toString().trim();
  const degree = (subject.degree || "").toString().trim();
  const issueDate = (subject.issueDate || "").toString().trim();
  const university = (subject.university || "").toString().trim();
  const graduationYear = Number(subject.graduationYear || (subject as any).year || 0);
  const cgpa = Number(Number(subject.cgpa || 0).toFixed(2));

  const normalized: Record<string, any> = {
    branch,
    cgpa,
    degree,
    fullName,
    graduationYear,
    issueDate,
    prn,
    university,
  };

  if (subject.nheqfCredits !== undefined) {
    normalized.nheqfCredits = Number(subject.nheqfCredits);
  }
  if (subject.nheqfLevel !== undefined) {
    normalized.nheqfLevel = Number(subject.nheqfLevel);
  }
  if (subject.institutionCode) {
    normalized.institutionCode = subject.institutionCode.toString().trim();
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
      network: "Local Institutional Registry",
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
 * Generates an RFC 4122 compliant UUID v4 string using cryptographically secure randomness.
 * Supports Next.js browser client (Web Crypto API) and Node.js server runtimes.
 * Never falls back to pseudo-random numbers or predictable counters.
 */
export function generateUUIDv4(): string {
  // Access standard Web Crypto API across browser (window.crypto / msCrypto) and Node.js (globalThis.crypto)
  const webCrypto =
    typeof globalThis !== "undefined"
      ? globalThis.crypto || (globalThis as any).msCrypto
      : typeof window !== "undefined"
      ? (window as any).crypto || (window as any).msCrypto
      : undefined;

  // 1. Primary path: crypto.randomUUID() (Modern browsers in secure contexts & Node.js 19+)
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  // 2. Universal CSPRNG fallback: crypto.getRandomValues() (All modern browsers & Node.js Web Crypto)
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC 4122 Version 4 (0100xxxx)
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 Variant 1 (10xxxxxx)
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  // 3. Fail-closed: Throw explicit error if no cryptographically secure random source is available
  throw new Error(
    "Cryptographically secure random number generator is unavailable in the current runtime environment."
  );
}

/**
 * Builds a W3C-style JSON-LD document with embedded Keccak-256 Merkle proof.
 * 
 * Identity Architecture (Strict Separation of Three Concerns):
 * -------------------------------------------------------------
 * 1. Issuer Identity (Authority Wallet):
 *    Identified by `issuer.ethereumAddress` (<issuerAddress>) and `issuer.name`.
 *    Represents the University / Examination Cell signing authority wallet.
 *    Separated from decentralized identifiers (DIDs) as no ERC-1056 DID registry
 *    or resolvable DID document is deployed on Sepolia for this address.
 *    Never conflated with the Credential Registry smart contract.
 * 
 * 2. Institutional Storage & Verification (Local Registry):
 *    Institutional database custody and local client/server Keccak-256 Merkle proof verification.
 *    No automatic claim of Ethereum anchoring or external registry resolution.
 * 
 * 3. Blockchain Registry (Smart Contract):
 *    The CredentialRegistry contract address (when configured) resides strictly in
 *    `proof.merkleProof.contractAddress`. It is NOT assigned as a DID verificationMethod
 *    because raw Ethereum smart contracts lack DID resolution documents. A credential
 *    is only treated as Ethereum-anchored when on-chain bytecode, transaction receipt,
 *    and Merkle root anchoring events are verified.
 * 
 * Proof Suite Specification:
 * - Proof type `EthereumMerkleProof2024` is a project-specific custom proof suite for
 *   EVM-anchored Keccak-256 Merkle trees, not a standardized W3C working group suite.
 * - `verificationMethod` is omitted in accordance with the W3C VC Data Model when no
 *   dereferenceable DID verification method document exists, preventing fabricated URNs.
 */
export function createW3CCredential(
  subject: StudentDegreeData,
  merkleProof: MerkleProofData,
  issuerAddress: string = "0x8D0cC3553e9d812797B986F15427835A2930a301",
  issuerName?: string,
  institutionCode?: string
): W3CCredentialPayload {
  const resolvedName = issuerName || subject.university || "Authorized Consortium University";
  const resolvedCode = institutionCode || subject.institutionCode || "MGMU-ENG-01";
  const safePrn = (subject.prn || (subject as any).PRN || "unknown").toString().toLowerCase();

  return {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://schema.org",
    ],
    id: `urn:uuid:${generateUUIDv4()}`,
    type: ["VerifiableCredential", "UniversityDegreeCredential"],
    issuer: {
      name: resolvedName,
      ethereumAddress: issuerAddress,
      institutionCode: resolvedCode,
    },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      ...subject,
      id: `did:pkh:eip155:11155111:student-${safePrn}`,
    },
    proof: {
      type: "EthereumMerkleProof2024",
      created: new Date().toISOString(),
      // verificationMethod omitted: No fabricated institutional URN or unsupported contract DID method.
      // The smart contract reference resides strictly in merkleProof.contractAddress.
      merkleProof: {
        ...merkleProof,
      },
    },
  };
}
