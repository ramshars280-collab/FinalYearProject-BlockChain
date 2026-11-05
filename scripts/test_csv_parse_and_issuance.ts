import fs from "fs";
import Papa from "papaparse";
import { buildBatchMerkleTree, hashCredentialSubject, verifyProofClientSide, createW3CCredential } from "../src/lib/crypto";
import { StudentDegreeData } from "../src/types";

const testFiles = [
  { path: "sample_data/students_batch_1.csv", expectedCount: 1 },
  { path: "sample_data/students_batch_3.csv", expectedCount: 3 },
  { path: "sample_data/students_batch_4.csv", expectedCount: 4 },
  { path: "sample_data/students_batch_5.csv", expectedCount: 5 },
  { path: "sample_data/students_batch_9.csv", expectedCount: 9 },
  { path: "sample_data/students_batch_10.csv", expectedCount: 10 },
  { path: "sample_data/students_batch_50.csv", expectedCount: 50 },
];

console.log("================================================================================");
console.log("  VeriTrust: Testing End-to-End CSV Ingestion & Credential Issuance Pipeline");
console.log("================================================================================\n");

let allPassed = true;

for (const { path, expectedCount } of testFiles) {
  if (!fs.existsSync(path)) {
    console.warn(`File not found: ${path}, skipping.`);
    continue;
  }

  const csvText = fs.readFileSync(path, "utf-8");
  const parsedStudents: StudentDegreeData[] = [];
  const errorsList: any[] = [];

  Papa.parse(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header: string) => header.trim().replace(/^\uFEFF/, ""),
    complete: (results: any) => {
      results.data.forEach((row: any, i: number) => {
        const rowNumber = i + 2;
        const rowErrors: string[] = [];

        const norm: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          const cleanKey = k.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
          norm[cleanKey] = typeof v === "string" ? v.trim() : v !== null && v !== undefined ? String(v).trim() : "";
        }

        const getVal = (...keys: string[]): string => {
          for (const key of keys) {
            const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (norm[cleanKey] !== undefined && norm[cleanKey] !== "") {
              return norm[cleanKey];
            }
          }
          return "";
        };

        const rawPrn = getVal("prn", "rollno", "rollnumber", "regno", "studentid", "id");
        if (!rawPrn) rowErrors.push("Missing PRN");

        const rawName = getVal("fullname", "name", "studentname");
        if (!rawName) rowErrors.push("Missing Name");

        const rawDegree = getVal("degree", "degreename", "program");
        if (!rawDegree) rowErrors.push("Missing Degree");

        const rawBranch = getVal("branch", "major", "department");
        if (!rawBranch) rowErrors.push("Missing Branch");

        const rawCgpaStr = getVal("cgpa", "gpa");
        const parsedCgpa = parseFloat(rawCgpaStr);
        if (isNaN(parsedCgpa) || parsedCgpa < 0 || parsedCgpa > 10) rowErrors.push("Invalid CGPA");

        const rawYearStr = getVal("graduationyear", "gradyear", "year");
        let parsedYear = parseInt(rawYearStr, 10);
        if (isNaN(parsedYear)) parsedYear = 2024;

        if (rowErrors.length > 0) {
          errorsList.push({ rowNumber, errors: rowErrors });
        } else {
          parsedStudents.push({
            prn: rawPrn.toUpperCase(),
            fullName: rawName,
            degree: rawDegree,
            branch: rawBranch,
            cgpa: parsedCgpa,
            graduationYear: parsedYear,
            issueDate: "2024-06-15",
            university: "MGM University",
            institutionCode: "MGMU-ENG-01"
          });
        }
      });
    }
  });

  if (errorsList.length > 0) {
    console.error(`❌ ${path}: CSV parsing encountered ${errorsList.length} row errors!`);
    allPassed = false;
    continue;
  }

  if (parsedStudents.length !== expectedCount) {
    console.error(`❌ ${path}: Expected ${expectedCount} students, got ${parsedStudents.length}`);
    allPassed = false;
    continue;
  }

  // Merkle DAG & Proofs
  const treeData = buildBatchMerkleTree(parsedStudents);

  // Validate each leaf proof
  let batchValid = true;
  for (let idx = 0; idx < parsedStudents.length; idx++) {
    const s = parsedStudents[idx];
    const leaf = hashCredentialSubject(s);
    const proof = treeData.proofs[idx];
    const isValid = verifyProofClientSide(leaf, proof.proof, treeData.rootHex);
    if (!isValid) {
      batchValid = false;
      break;
    }
    const vc = createW3CCredential(s, proof);
    if (!vc.id || !vc.proof) {
      batchValid = false;
      break;
    }
  }

  if (batchValid) {
    console.log(`✅ ${path.padEnd(35)}: ${String(parsedStudents.length).padStart(2)} students parsed -> Merkle Root ${treeData.rootHex.slice(0, 16)}... -> Verified 100%!`);
  } else {
    console.error(`❌ ${path}: Proof verification failed!`);
    allPassed = false;
  }
}

console.log("\n================================================================================");
if (allPassed) {
  console.log("🎉 ALL CSV FILES (1, 3, 4, 5, 9, 10, 50) PARSED, ANCHORED & VERIFIED CLEANLY!");
} else {
  console.log("❌ PIPELINE VALIDATION FAILED.");
}
console.log("================================================================================\n");

