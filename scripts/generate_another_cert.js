const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const keccak256 = require("keccak256");
const { MerkleTree } = require("merkletreejs");

function canonicalStringify(obj) {
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

function hashCredentialSubject(subject) {
  const normalized = {
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
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

function buildBatchMerkleTree(records) {
  const leaves = records.map((record) => {
    const hexHash = hashCredentialSubject(record);
    return Buffer.from(hexHash.slice(2), "hex");
  });

  const tree = new MerkleTree(leaves, keccak256, {
    sortPairs: true,
  });

  const rootHex = "0x" + tree.getRoot().toString("hex");

  const proofs = records.map((record, index) => {
    const leafBuf = leaves[index];
    const proofBufs = tree.getProof(leafBuf);
    const proofHex = proofBufs.map((p) => "0x" + p.data.toString("hex"));
    const leafHash = "0x" + leafBuf.toString("hex");

    return {
      batchId: "MGM-2024-BTECH-BATCH01",
      leafIndex: index,
      leafHash,
      rootHash: rootHex,
      proof: proofHex,
      contractAddress: "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7",
      network: "Ethereum Sepolia",
      chainId: 11155111,
    };
  });

  return {
    tree,
    rootHex,
    proofs,
  };
}

function verifyProofClientSide(leafHex, proofHex, rootHex) {
  try {
    let computedHash = leafHex.toLowerCase();
    const targetRoot = rootHex.toLowerCase();

    for (const p of proofHex) {
      const proofElement = p.toLowerCase();
      let combined;
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

const INITIAL_STUDENTS_MGM = [
  {
    prn: "PRN20200101",
    fullName: "Aarav Sharma",
    degree: "Bachelor of Technology",
    branch: "Computer Science & Engineering",
    cgpa: 9.24,
    graduationYear: 2024,
    issueDate: "2024-06-15",
    nheqfCredits: 164,
    nheqfLevel: 6.0,
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    division: "First Class with Distinction",
  },
  {
    prn: "PRN20200102",
    fullName: "Ananya Malhotra",
    degree: "Bachelor of Technology",
    branch: "Artificial Intelligence & Data Science",
    cgpa: 8.85,
    graduationYear: 2024,
    issueDate: "2024-06-15",
    nheqfCredits: 162,
    nheqfLevel: 6.0,
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    division: "First Class with Distinction",
  },
  {
    prn: "PRN20200103",
    fullName: "Rohan Kulkarni",
    degree: "Bachelor of Technology",
    branch: "Information Technology",
    cgpa: 7.92,
    graduationYear: 2024,
    issueDate: "2024-06-15",
    nheqfCredits: 160,
    nheqfLevel: 6.0,
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    division: "First Class",
  },
  {
    prn: "PRN20200104",
    fullName: "Pooja Patil",
    degree: "Bachelor of Technology",
    branch: "Electronics & Computer Engineering",
    cgpa: 8.41,
    graduationYear: 2024,
    issueDate: "2024-06-15",
    nheqfCredits: 160,
    nheqfLevel: 6.0,
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    division: "First Class with Distinction",
  },
];

const treeData = buildBatchMerkleTree(INITIAL_STUDENTS_MGM);

function generateCertForIndex(index, slug) {
  const student = INITIAL_STUDENTS_MGM[index];
  const proofData = treeData.proofs[index];

  const isValid = verifyProofClientSide(proofData.leafHash, proofData.proof, treeData.rootHex);
  console.log(`Proof verification for ${student.fullName} (${student.prn}): ${isValid}`);

  const certPayload = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://schema.org",
      "https://w3id.org/security/suites/ed25519-2020/v1",
    ],
    id: `urn:uuid:degree-cert-${student.prn.toLowerCase()}-${student.graduationYear}`,
    type: ["VerifiableCredential", "UniversityDegreeCredential"],
    issuer: {
      id: "did:ethr:11155111:0x71C56538b15294500B73f8472B4fE963D4e58bEf",
      name: "MGM University, Chhatrapati Sambhajinagar",
      url: "https://blockchain.trust-registry.ac.in/verify",
      ethereumAddress: "0x71C56538b15294500B73f8472B4fE963D4e58bEf",
      institutionCode: "MGMU-ENG-01",
    },
    issuanceDate: "2024-06-15T10:00:00.000Z",
    credentialSubject: {
      ...student,
      id: `did:pkh:eip155:11155111:student-${student.prn.toLowerCase()}`,
    },
    proof: {
      type: "EthereumMerkleProof2024",
      created: "2024-06-15T10:00:00.000Z",
      verificationMethod: `did:ethr:11155111:${proofData.contractAddress}#merkleRoot`,
      merkleProof: {
        ...proofData,
      },
    },
  };

  const fixturePath = path.join(__dirname, "..", "public", "fixtures", `valid_degree_${slug}.json`);
  const rootSamplePath = path.join(__dirname, "..", `sample_degree_${slug}.json`);

  fs.writeFileSync(fixturePath, JSON.stringify(certPayload, null, 2));
  fs.writeFileSync(rootSamplePath, JSON.stringify(certPayload, null, 2));

  console.log(`Saved: ${fixturePath}`);
  console.log(`Saved: ${rootSamplePath}`);
}

generateCertForIndex(1, "ananya_malhotra");
generateCertForIndex(2, "rohan_kulkarni");
