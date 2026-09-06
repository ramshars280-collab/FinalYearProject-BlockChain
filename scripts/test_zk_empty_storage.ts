import { saveBatchDb, getBatchByIdDb } from '../src/lib/db';
import { buildBatchMerkleTree, createW3CCredential } from '../src/lib/crypto';
import { generateSelectiveDisclosureProof, verifyZkSelectiveProof } from '../src/lib/zkProof';
import { StudentDegreeData, BatchRecord } from '../src/types';

async function testZkEmptyLocalStorage() {
  console.log("==========================================================");
  console.log("TEST: Selective Disclosure Verification with Empty LocalStorage");
  console.log("==========================================================");

  // 1. Anchor a new batch into SQLite database (Simulating Issuer UI anchoring)
  const batchId = "MGMU-ZK-VERIFY-TEST2026";
  const students: StudentDegreeData[] = [
    {
      prn: "PRN20268888",
      fullName: "Pooja Hegde",
      degree: "Bachelor of Technology in Artificial Intelligence",
      branch: "Artificial Intelligence",
      cgpa: 9.35,
      graduationYear: 2026,
      issueDate: "2026-06-15",
      university: "MGM University",
      institutionCode: "MGMU-ENG-01",
    },
  ];

  const tree = buildBatchMerkleTree(students);
  const newBatch: BatchRecord = {
    batchId,
    merkleRoot: tree.rootHex,
    ipfsCid: "ipfs://bafybeigzktestcid",
    timestamp: Math.floor(Date.now() / 1000),
    issuer: "0x71C56538b15294500B73f8472B4fE963D4e58bEf",
    institutionName: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    totalCredentials: students.length,
    revokedIndices: [],
    records: students,
  };

  saveBatchDb(newBatch);
  console.log("✓ Step 1: Batch anchored into SQLite DB:", batchId);

  // 2. Generate original credential & selective disclosure proof
  const proofObj = {
    ...tree.proofs[0],
    batchId,
    contractAddress: "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7",
  };
  const originalCredential = createW3CCredential(
    students[0],
    proofObj,
    newBatch.issuer,
    newBatch.institutionName,
    newBatch.institutionCode
  );

  // Generate selective proof asserting CGPA >= 8.5 with PII redacted
  const zkCredential = generateSelectiveDisclosureProof(originalCredential, 8.5, true);
  console.log("✓ Step 2: Generated Selective Disclosure Credential (Assertion: CGPA >= 8.5)");
  console.log("  Redacted Full Name in Credential:", zkCredential.credentialSubject.fullName);
  console.log("  Redacted PRN in Credential:", zkCredential.credentialSubject.prn);

  // 3. Verify in a completely clean session with ZERO localStorage
  // Ensure that no localStorage exists or is read
  console.log("\nStep 3: Verifying ZK credential from independent session (NO localStorage)...");
  
  const verificationResult = await verifyZkSelectiveProof(zkCredential);
  console.log("✓ Verification Result:", verificationResult);

  if (!verificationResult.isValid) {
    console.error("❌ FAILED: Selective proof failed to verify!");
    process.exit(1);
  }

  if (verificationResult.actualCgpa !== 9.35) {
    console.error("❌ FAILED: Actual CGPA did not match DB record!");
    process.exit(1);
  }

  console.log("\n==========================================================");
  console.log("✓ CONFIRMATION (b) PASSED: Verified against server DB!");
  console.log("  Evaluated authentic CGPA (9.35) against threshold (8.5)");
  console.log("  Zero reliance on browser localStorage.");
  console.log("==========================================================");
}

testZkEmptyLocalStorage().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
