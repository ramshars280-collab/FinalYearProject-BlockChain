import { buildBatchMerkleTree, hashCredentialSubject, verifyProofClientSide, createW3CCredential } from "../src/lib/crypto";
import { StudentDegreeData } from "../src/types";
import { ethers } from "ethers";

// Solidity-equivalent Merkle proof verification (from CredentialRegistry.sol)
function verifyMerkleProofSolidity(proof: string[], root: string, leaf: string): boolean {
  let computedHash = leaf.toLowerCase();
  const rootTarget = root.toLowerCase();

  for (let i = 0; i < proof.length; i++) {
    const proofElement = proof[i].toLowerCase();
    let combined: string;
    if (computedHash <= proofElement) {
      combined = ethers.solidityPacked(["bytes32", "bytes32"], [computedHash, proofElement]);
    } else {
      combined = ethers.solidityPacked(["bytes32", "bytes32"], [proofElement, computedHash]);
    }
    computedHash = ethers.keccak256(combined).toLowerCase();
  }

  return computedHash === rootTarget;
}

function generateMockStudents(count: number): StudentDegreeData[] {
  const branches = [
    "Computer Science & Engineering",
    "Artificial Intelligence & Data Science",
    "Information Technology",
    "IoT & Cyber Security Including Blockchain",
    "Electronics & Computer Engineering"
  ];

  return Array.from({ length: count }, (_, i) => {
    const num = String(i + 1).padStart(4, "0");
    return {
      prn: `PRN2024TEST${num}`,
      fullName: `Test Student ${i + 1}`,
      degree: "Bachelor of Technology",
      branch: branches[i % branches.length],
      cgpa: Number((7.5 + (i * 0.05) % 2.5).toFixed(2)),
      graduationYear: 2024,
      issueDate: "2024-06-15",
      nheqfCredits: 160,
      nheqfLevel: 6.0,
      university: "MGM University, Chhatrapati Sambhajinagar",
      institutionCode: "MGMU-ENG-01"
    };
  });
}

const testBatchSizes = [1, 3, 4, 5, 9, 10, 50];

console.log("================================================================================");
console.log("  SOET VeriTrust: Comprehensive Batch Size Cryptographic & Issuance Validation");
console.log("================================================================================\n");

let allPassed = true;

for (const size of testBatchSizes) {
  const students = generateMockStudents(size);
  console.log(`--> Testing Batch Size: ${size} student${size > 1 ? "s" : ""}...`);

  // 1. Build Merkle Tree
  const treeData = buildBatchMerkleTree(students);
  console.log(`    Merkle Root: ${treeData.rootHex.slice(0, 18)}... (Leaves: ${treeData.leavesHex.length})`);

  if (!treeData.rootHex || treeData.rootHex === "0x") {
    console.error(`    ❌ Invalid Merkle root for size ${size}`);
    allPassed = false;
    continue;
  }

  if (treeData.proofs.length !== size) {
    console.error(`    ❌ Expected ${size} proofs, got ${treeData.proofs.length}`);
    allPassed = false;
    continue;
  }

  // 2. Verify Every Single Student Credential in the Batch
  let batchValid = true;
  for (let idx = 0; idx < size; idx++) {
    const student = students[idx];
    const proofData = treeData.proofs[idx];
    const leafHash = hashCredentialSubject(student);

    if (leafHash.toLowerCase() !== proofData.leafHash.toLowerCase()) {
      console.error(`    ❌ Leaf hash mismatch at index ${idx}`);
      batchValid = false;
      break;
    }

    // Verify client-side (crypto.ts)
    const clientValid = verifyProofClientSide(leafHash, proofData.proof, treeData.rootHex);
    if (!clientValid) {
      console.error(`    ❌ Client-side proof verification failed for student ${idx} (${student.prn})`);
      batchValid = false;
      break;
    }

    // Verify contract-side (CredentialRegistry.sol logic)
    const contractValid = verifyMerkleProofSolidity(proofData.proof, treeData.rootHex, leafHash);
    if (!contractValid) {
      console.error(`    ❌ Solidity-equivalent proof verification failed for student ${idx} (${student.prn})`);
      batchValid = false;
      break;
    }

    // Generate W3C Verifiable Credential
    const vc = createW3CCredential(student, proofData);
    if (!vc || !vc.proof || !vc.credentialSubject) {
      console.error(`    ❌ W3C VC creation failed for student ${idx}`);
      batchValid = false;
      break;
    }

    // Test bitmap revocation index logic (wordIndex and bitIndex calculation)
    const wordIndex = Math.floor(idx / 256);
    const bitIndex = idx % 256;
    if (wordIndex < 0 || bitIndex < 0 || bitIndex > 255) {
      console.error(`    ❌ Bitmap revocation calculation invalid for index ${idx}`);
      batchValid = false;
      break;
    }
  }

  if (batchValid) {
    console.log(`    ✅ Successfully validated all ${size} credentials & proofs! (Proof depth: ${treeData.proofs[0].proof.length} hops)`);
  } else {
    allPassed = false;
  }
}

console.log("\n================================================================================");
if (allPassed) {
  console.log("🎉 ALL BATCH SIZES (1, 3, 4, 5, 9, 10, 50) PASSED CRYPTOGRAPHIC VERIFICATION!");
} else {
  console.log("❌ SOME TESTS FAILED.");
}
console.log("================================================================================\n");

