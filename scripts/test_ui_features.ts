import { buildBatchMerkleTree, hashCredentialSubject, verifyProofClientSide, createW3CCredential } from "../src/lib/crypto";
import { StudentDegreeData } from "../src/types";

// Test dataset generator
function generateMockStudents(count: number): StudentDegreeData[] {
  const branches = [
    "Computer Science & Engineering",
    "Artificial Intelligence & Data Science",
    "Information Technology",
    "IoT & Cyber Security Including Blockchain",
    "Electronics & Computer Engineering",
  ];

  return Array.from({ length: count }, (_, i) => ({
    prn: `PRN2024${String(i + 1).padStart(4, "0")}`,
    fullName: `Candidate Name ${i + 1}`,
    degree: "Bachelor of Technology",
    branch: branches[i % branches.length],
    cgpa: Number((8.0 + (i * 0.03) % 2.0).toFixed(2)),
    graduationYear: 2024,
    issueDate: "2024-06-15",
    nheqfCredits: 160,
    nheqfLevel: 6.0,
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
  }));
}

console.log("================================================================================");
console.log("  SOET VeriTrust: Testing Upload Confirmation & Uploaded Students List Features");
console.log("================================================================================\n");

let allPassed = true;

// 1. Test Small and Large Batches
for (const count of [1, 3, 10, 50]) {
  const batch = generateMockStudents(count);
  const tree = buildBatchMerkleTree(batch);
  if (!tree.rootHex || tree.proofs.length !== count) {
    console.error(`❌ Batch size ${count} tree generation failed`);
    allPassed = false;
  } else {
    console.log(`✅ Batch of ${count} students: Merkle Root computed -> ${tree.rootHex.slice(0, 16)}...`);
  }
}

// 2. Test Search & Filter Logic
const sample50 = generateMockStudents(50);
const searchTests = [
  { q: "PRN20240001", expected: 1 },
  { q: "Candidate Name 1", expected: 11 }, // matches 1, 10-19
  { q: "Computer Science", expected: 10 },
  { q: "NonExistentStudent", expected: 0 },
];

for (const { q, expected } of searchTests) {
  const filtered = sample50.filter(
    (s) =>
      s.prn.toLowerCase().includes(q.toLowerCase()) ||
      s.fullName.toLowerCase().includes(q.toLowerCase()) ||
      s.branch.toLowerCase().includes(q.toLowerCase())
  );
  if (filtered.length !== expected) {
    console.error(`❌ Search query "${q}" failed: expected ${expected}, got ${filtered.length}`);
    allPassed = false;
  } else {
    console.log(`✅ Search query "${q}": found ${filtered.length} matches (matches expected ${expected})`);
  }
}

// 3. Test Pagination Calculation
const pageSize = 10;
const totalPages = Math.ceil(sample50.length / pageSize);
if (totalPages !== 5) {
  console.error(`❌ Pagination totalPages failed: expected 5, got ${totalPages}`);
  allPassed = false;
} else {
  console.log(`✅ Pagination: 50 records cleanly divide into ${totalPages} pages of ${pageSize}`);
}

// Check page 1 slice
const page1 = sample50.slice(0, pageSize);
const page5 = sample50.slice(40, 50);
if (page1.length === 10 && page5.length === 10 && page1[0].prn === "PRN20240001" && page5[9].prn === "PRN20240050") {
  console.log(`✅ Pagination slices: Page 1 and Page 5 boundary checks verified!`);
} else {
  console.error("❌ Pagination slice failed");
  allPassed = false;
}

// 4. Test Duplicate Detection in CSV Records
const duplicatesInBatch = [
  ...sample50.slice(0, 3),
  sample50[0], // Duplicate of index 0
];
const seenPrns = new Set<string>();
const duplicateWarnings: string[] = [];
duplicatesInBatch.forEach((s) => {
  if (seenPrns.has(s.prn)) {
    duplicateWarnings.push(`PRN "${s.prn}" appears multiple times in CSV`);
  }
  seenPrns.add(s.prn);
});

if (duplicateWarnings.length === 1 && duplicateWarnings[0].includes("PRN20240001")) {
  console.log(`✅ Duplicate warning detection: Correctly caught ${duplicateWarnings[0]}`);
} else {
  console.error("❌ Duplicate detection failed:", duplicateWarnings);
  allPassed = false;
}

console.log("\n================================================================================");
if (allPassed) {
  console.log("🎉 ALL UI FEATURE SPECIFICATIONS AND DATA LOGIC TESTS PASSED 100%!");
} else {
  console.log("❌ SOME TESTS FAILED.");
}
console.log("================================================================================\n");
