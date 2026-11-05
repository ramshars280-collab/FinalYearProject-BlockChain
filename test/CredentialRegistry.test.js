const hre = require("hardhat");
const { ethers } = require("ethers");
const assert = require("assert");
const fs = require("fs");
const path = require("path");

describe("CredentialRegistry Smart Contract", function () {
  let provider;
  let deployer;
  let unauthorizedUser;
  let consortiumUniversity;
  let contract;
  let contractAddress;

  // Deterministic Merkle tree test helpers
  const sortedPair = (a, b) => {
    return BigInt(a) <= BigInt(b)
      ? ethers.keccak256(ethers.concat([a, b]))
      : ethers.keccak256(ethers.concat([b, a]));
  };

  const leaf0 = ethers.keccak256(ethers.toUtf8Bytes("PRN20200101:Aarav Sharma:B.Tech:9.24"));
  const leaf1 = ethers.keccak256(ethers.toUtf8Bytes("PRN20200102:Ananya Malhotra:B.Tech:8.85"));
  const leaf2 = ethers.keccak256(ethers.toUtf8Bytes("PRN20200103:Rohan Kulkarni:B.Tech:7.92"));
  const leaf3 = ethers.keccak256(ethers.toUtf8Bytes("PRN20200104:Pooja Patil:B.Tech:8.41"));

  const parent01 = sortedPair(leaf0, leaf1);
  const parent23 = sortedPair(leaf2, leaf3);
  const root = sortedPair(parent01, parent23);

  // Proof for leaf0: sibling is leaf1, then sibling parent23
  const proof0 = [leaf1, parent23];
  const proof1 = [leaf0, parent23];

  const testBatchId = "MGM-2024-BTECH-BATCH01";
  const testIpfsCid = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(hre.network.provider);
    deployer = await provider.getSigner(0);
    unauthorizedUser = await provider.getSigner(1);
    consortiumUniversity = await provider.getSigner(2);

    const artifactPath = path.join(
      __dirname,
      "../artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json"
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
    contract = await factory.deploy();
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();
  });

  describe("1. Deployment & Initialization", function () {
    it("should deploy with non-empty bytecode and zero constructor arguments", async function () {
      const code = await provider.getCode(contractAddress);
      assert.ok(code && code !== "0x" && code.length > 2);
    });

    it("should initialize deployer as the owner", async function () {
      const owner = await contract.owner();
      assert.strictEqual(owner.toLowerCase(), deployer.address.toLowerCase());
    });

    it("should authorize deployer as default issuer", async function () {
      const isAuthorized = await contract.authorizedIssuers(deployer.address);
      assert.strictEqual(isAuthorized, true);
    });

    it("should set default institution name for deployer", async function () {
      const name = await contract.institutionNames(deployer.address);
      assert.strictEqual(name, "MGM University, Chhatrapati Sambhajinagar");
    });
  });

  describe("2. Merkle Root Anchoring", function () {
    it("should successfully anchor a batch and emit BatchAnchored", async function () {
      const tx = await contract.anchorMerkleRoot(testBatchId, root, testIpfsCid);
      const receipt = await tx.wait();
      assert.strictEqual(receipt.status, 1);

      // Check emitted event in logs
      const filter = contract.filters.BatchAnchored();
      const events = await contract.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].args.batchId, testBatchId);
      assert.strictEqual(events[0].args.merkleRoot, root);
      assert.strictEqual(events[0].args.ipfsCid, testIpfsCid);
      assert.strictEqual(events[0].args.issuer.toLowerCase(), deployer.address.toLowerCase());
    });

    it("should accurately retrieve anchored batch info via getBatchInfo", async function () {
      await contract.anchorMerkleRoot(testBatchId, root, testIpfsCid);
      const batchInfo = await contract.getBatchInfo(testBatchId);

      assert.strictEqual(batchInfo.exists, true);
      assert.strictEqual(batchInfo.merkleRoot, root);
      assert.strictEqual(batchInfo.ipfsCid, testIpfsCid);
      assert.strictEqual(batchInfo.issuer.toLowerCase(), deployer.address.toLowerCase());
      assert.strictEqual(batchInfo.institutionName, "MGM University, Chhatrapati Sambhajinagar");
      assert.ok(Number(batchInfo.timestamp) > 0);
    });

    it("should reject anchoring duplicate batchId", async function () {
      await contract.anchorMerkleRoot(testBatchId, root, testIpfsCid);
      await assert.rejects(
        async () => {
          await contract.anchorMerkleRoot(testBatchId, root, testIpfsCid);
        },
        (err) => err.message.includes("CredentialRegistry: batch already anchored")
      );
    });

    it("should reject anchoring with zero bytes32 Merkle root", async function () {
      const zeroRoot = ethers.ZeroHash;
      await assert.rejects(
        async () => {
          await contract.anchorMerkleRoot("BATCH_INVALID", zeroRoot, testIpfsCid);
        },
        (err) => err.message.includes("CredentialRegistry: invalid merkle root")
      );
    });
  });

  describe("3. Merkle Proof Verification", function () {
    beforeEach(async function () {
      await contract.anchorMerkleRoot(testBatchId, root, testIpfsCid);
    });

    it("should return (true, false) for a valid Merkle proof on an unrevoked leaf", async function () {
      const [isValid, isRevoked] = await contract.verifyCredential(testBatchId, leaf0, proof0, 0);
      assert.strictEqual(isValid, true);
      assert.strictEqual(isRevoked, false);
    });

    it("should return (true, false) for another valid leaf in the same batch", async function () {
      const [isValid, isRevoked] = await contract.verifyCredential(testBatchId, leaf1, proof1, 1);
      assert.strictEqual(isValid, true);
      assert.strictEqual(isRevoked, false);
    });

    it("should return (false, false) for a tampered credential leaf", async function () {
      const fakeLeaf = ethers.keccak256(ethers.toUtf8Bytes("TAMPERED_RECORD"));
      const [isValid, isRevoked] = await contract.verifyCredential(testBatchId, fakeLeaf, proof0, 0);
      assert.strictEqual(isValid, false);
      assert.strictEqual(isRevoked, false);
    });

    it("should return (false, false) for a non-existent batch", async function () {
      const [isValid, isRevoked] = await contract.verifyCredential("NON_EXISTENT_BATCH", leaf0, proof0, 0);
      assert.strictEqual(isValid, false);
      assert.strictEqual(isRevoked, false);
    });
  });

  describe("4. Bitmap Revocation Operations", function () {
    beforeEach(async function () {
      await contract.anchorMerkleRoot(testBatchId, root, testIpfsCid);
    });

    it("should successfully revoke a credential leaf and emit CredentialRevoked", async function () {
      const tx = await contract.revokeCredential(testBatchId, 0);
      const receipt = await tx.wait();
      assert.strictEqual(receipt.status, 1);

      const filter = contract.filters.CredentialRevoked();
      const events = await contract.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].args.batchId, testBatchId);
      assert.strictEqual(Number(events[0].args.leafIndex), 0);
      assert.strictEqual(events[0].args.revoker.toLowerCase(), deployer.address.toLowerCase());
    });

    it("should report revoked status via isCredentialRevoked in O(1)", async function () {
      assert.strictEqual(await contract.isCredentialRevoked(testBatchId, 0), false);
      await contract.revokeCredential(testBatchId, 0);
      assert.strictEqual(await contract.isCredentialRevoked(testBatchId, 0), true);
      assert.strictEqual(await contract.isCredentialRevoked(testBatchId, 1), false);
    });

    it("should accurately track multiple independent revocations in the bitmap", async function () {
      assert.strictEqual(await contract.isCredentialRevoked(testBatchId, 0), false);
      assert.strictEqual(await contract.isCredentialRevoked(testBatchId, 3), false);

      await contract.revokeCredential(testBatchId, 0);
      assert.strictEqual(await contract.isCredentialRevoked(testBatchId, 0), true);
      assert.strictEqual(await contract.isCredentialRevoked(testBatchId, 3), false);

      await contract.revokeCredential(testBatchId, 3);
      assert.strictEqual(await contract.isCredentialRevoked(testBatchId, 0), true);
      assert.strictEqual(await contract.isCredentialRevoked(testBatchId, 3), true);

      // Verify unrevoked leaf 1 and leaf 2 remain unrevoked
      assert.strictEqual(await contract.isCredentialRevoked(testBatchId, 1), false);
      assert.strictEqual(await contract.isCredentialRevoked(testBatchId, 2), false);
    });

    it("should return (true, true) when verifying a valid but revoked credential", async function () {
      await contract.revokeCredential(testBatchId, 0);
      const [isValid, isRevoked] = await contract.verifyCredential(testBatchId, leaf0, proof0, 0);
      assert.strictEqual(isValid, true, "Merkle proof remains cryptographically valid");
      assert.strictEqual(isRevoked, true, "Credential is flagged as revoked by dynamic bitmap");
    });

    it("should reject duplicate revocation of the same leaf", async function () {
      await contract.revokeCredential(testBatchId, 0);
      await assert.rejects(
        async () => {
          await contract.revokeCredential(testBatchId, 0);
        },
        (err) => err.message.includes("CredentialRegistry: already revoked")
      );
    });
  });

  describe("5. Access Control & Consortium Registration", function () {
    it("should prevent unauthorized non-issuer accounts from anchoring roots", async function () {
      const unauthorizedContract = contract.connect(unauthorizedUser);
      await assert.rejects(
        async () => {
          await unauthorizedContract.anchorMerkleRoot(testBatchId, root, testIpfsCid);
        },
        (err) => err.message.includes("CredentialRegistry: caller is not authorized issuer")
      );
    });

    it("should prevent unauthorized non-issuer accounts from revoking credentials", async function () {
      await contract.anchorMerkleRoot(testBatchId, root, testIpfsCid);
      const unauthorizedContract = contract.connect(unauthorizedUser);
      await assert.rejects(
        async () => {
          await unauthorizedContract.revokeCredential(testBatchId, 0);
        },
        (err) => err.message.includes("CredentialRegistry: caller is not authorized issuer")
      );
    });

    it("should prevent non-owner from registering an institution", async function () {
      const unauthorizedContract = contract.connect(unauthorizedUser);
      await assert.rejects(
        async () => {
          await unauthorizedContract.registerInstitution(consortiumUniversity.address, "Consortium Partner");
        },
        (err) => err.message.includes("CredentialRegistry: caller is not owner")
      );
    });

    it("should allow owner to register a new consortium institution and permit it to anchor", async function () {
      const instName = "IIT Bombay Partner Institution";
      await contract.registerInstitution(consortiumUniversity.address, instName);

      const isAuthorized = await contract.authorizedIssuers(consortiumUniversity.address);
      assert.strictEqual(isAuthorized, true);

      const savedName = await contract.institutionNames(consortiumUniversity.address);
      assert.strictEqual(savedName, instName);

      // Now the registered consortium university anchors their batch
      const consortiumContract = contract.connect(consortiumUniversity);
      const newBatchId = "IITB-2024-PHD-BATCH01";
      const tx = await consortiumContract.anchorMerkleRoot(newBatchId, root, "QmConsortiumCid");
      const receipt = await tx.wait();
      assert.strictEqual(receipt.status, 1);

      const batchInfo = await contract.getBatchInfo(newBatchId);
      assert.strictEqual(batchInfo.exists, true);
      assert.strictEqual(batchInfo.issuer.toLowerCase(), consortiumUniversity.address.toLowerCase());
      assert.strictEqual(batchInfo.institutionName, instName);
    });
  });
});
