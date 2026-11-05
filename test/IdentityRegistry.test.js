const hre = require("hardhat");
const { ethers } = require("ethers");
const assert = require("assert");
const fs = require("fs");
const path = require("path");

describe("IdentityRegistry Smart Contract", function () {
  let provider;
  let deployer;
  let student1;
  let student2;
  let attacker;
  let contract;
  let contractAddress;
  let chainId;
  let domain;

  const prn1 = "PRN20200101";
  const prn2 = "PRN20200102";

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(hre.network.provider);
    deployer = await provider.getSigner(0);
    student1 = await provider.getSigner(1);
    student2 = await provider.getSigner(2);
    attacker = await provider.getSigner(3);

    const network = await provider.getNetwork();
    chainId = Number(network.chainId);

    const artifactPath = path.join(
      __dirname,
      "../artifacts/contracts/IdentityRegistry.sol/IdentityRegistry.json"
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
    contract = await factory.deploy();
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();

    domain = {
      name: "SOET VeriTrust",
      version: "1",
      chainId: chainId,
      verifyingContract: contractAddress,
    };
  });

  describe("1. Deployment & Initialization", function () {
    it("should deploy successfully with zero constructor arguments", async function () {
      const code = await provider.getCode(contractAddress);
      assert.ok(code && code !== "0x" && code.length > 2);
    });

    it("should initialize deployer as owner", async function () {
      const owner = await contract.owner();
      assert.strictEqual(owner.toLowerCase(), deployer.address.toLowerCase());
    });

    it("should compute valid DOMAIN_SEPARATOR", async function () {
      const sep = await contract.DOMAIN_SEPARATOR();
      assert.ok(sep && sep !== ethers.ZeroHash && sep.length === 66);
    });
  });

  describe("2. EIP-712 Identity Binding", function () {
    it("should bind student identity with valid EIP-712 signature and emit IdentityBound", async function () {
      const timestamp = Math.floor(Date.now() / 1000);
      const types = {
        IdentityBinding: [
          { name: "prn", type: "string" },
          { name: "wallet", type: "address" },
          { name: "timestamp", type: "uint256" },
        ],
      };
      const value = {
        prn: prn1,
        wallet: student1.address,
        timestamp: timestamp,
      };

      const signature = await student1.signTypedData(domain, types, value);
      const studentContract = contract.connect(student1);

      const tx = await studentContract.bindIdentity(prn1, timestamp, signature);
      const receipt = await tx.wait();
      assert.strictEqual(receipt.status, 1);

      // Verify event log
      const filter = contract.filters.IdentityBound();
      const events = await contract.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].args.prn, prn1);
      assert.strictEqual(events[0].args.wallet.toLowerCase(), student1.address.toLowerCase());

      // Verify view functions
      const boundWallet = await contract.getBoundWallet(prn1);
      assert.strictEqual(boundWallet.toLowerCase(), student1.address.toLowerCase());

      const boundPRN = await contract.getBoundPRN(student1.address);
      assert.strictEqual(boundPRN, prn1);

      const bindingTs = await contract.getBindingTimestamp(prn1);
      assert.ok(Number(bindingTs) > 0);
    });

    it("should reject binding when PRN string is empty", async function () {
      const timestamp = Math.floor(Date.now() / 1000);
      const dummySig = "0x" + "00".repeat(65);
      await assert.rejects(
        async () => {
          await contract.connect(student1).bindIdentity("", timestamp, dummySig);
        },
        (err) => err.message.includes("IdentityRegistry: PRN cannot be empty")
      );
    });

    it("should reject binding when signature length is invalid", async function () {
      const timestamp = Math.floor(Date.now() / 1000);
      const shortSig = "0x123456";
      await assert.rejects(
        async () => {
          await contract.connect(student1).bindIdentity(prn1, timestamp, shortSig);
        },
        (err) => err.message.includes("IdentityRegistry: invalid signature length")
      );
    });

    it("should reject binding when signature does not match msg.sender", async function () {
      const timestamp = Math.floor(Date.now() / 1000);
      const types = {
        IdentityBinding: [
          { name: "prn", type: "string" },
          { name: "wallet", type: "address" },
          { name: "timestamp", type: "uint256" },
        ],
      };
      // Student 1 signs, but attacker tries to submit as msg.sender
      const value = {
        prn: prn1,
        wallet: attacker.address,
        timestamp: timestamp,
      };

      // Attacker signs, but claims student1's PRN while signature recovers to attacker
      const signatureByAttacker = await attacker.signTypedData(domain, types, value);

      // Student 1 submits attacker's signature
      await assert.rejects(
        async () => {
          await contract.connect(student1).bindIdentity(prn1, timestamp, signatureByAttacker);
        },
        (err) => err.message.includes("IdentityRegistry: signature does not match msg.sender")
      );
    });
  });

  describe("3. Conflict and Replay Prevention", function () {
    let timestamp1;
    let signature1;

    beforeEach(async function () {
      timestamp1 = Math.floor(Date.now() / 1000);
      const types = {
        IdentityBinding: [
          { name: "prn", type: "string" },
          { name: "wallet", type: "address" },
          { name: "timestamp", type: "uint256" },
        ],
      };
      const value1 = {
        prn: prn1,
        wallet: student1.address,
        timestamp: timestamp1,
      };
      signature1 = await student1.signTypedData(domain, types, value1);
      await contract.connect(student1).bindIdentity(prn1, timestamp1, signature1);
    });

    it("should reject re-binding an already bound PRN to a different wallet", async function () {
      const timestamp2 = timestamp1 + 10;
      const types = {
        IdentityBinding: [
          { name: "prn", type: "string" },
          { name: "wallet", type: "address" },
          { name: "timestamp", type: "uint256" },
        ],
      };
      const value2 = {
        prn: prn1,
        wallet: student2.address,
        timestamp: timestamp2,
      };
      const signature2 = await student2.signTypedData(domain, types, value2);

      await assert.rejects(
        async () => {
          await contract.connect(student2).bindIdentity(prn1, timestamp2, signature2);
        },
        (err) => err.message.includes("IdentityRegistry: PRN already bound")
      );
    });

    it("should reject binding an already bound wallet to a different PRN", async function () {
      const timestamp3 = timestamp1 + 20;
      const types = {
        IdentityBinding: [
          { name: "prn", type: "string" },
          { name: "wallet", type: "address" },
          { name: "timestamp", type: "uint256" },
        ],
      };
      const value3 = {
        prn: prn2,
        wallet: student1.address,
        timestamp: timestamp3,
      };
      const signature3 = await student1.signTypedData(domain, types, value3);

      await assert.rejects(
        async () => {
          await contract.connect(student1).bindIdentity(prn2, timestamp3, signature3);
        },
        (err) => err.message.includes("IdentityRegistry: wallet already bound to a PRN")
      );
    });
  });

  describe("4. Zero-PII Identity Binding", function () {
    it("should successfully bind zero-PII commitment hash to student wallet", async function () {
      const prnHash = ethers.keccak256(ethers.toUtf8Bytes(prn1));
      const timestamp = Math.floor(Date.now() / 1000);

      const types = {
        IdentityHashBinding: [
          { name: "prnHash", type: "bytes32" },
          { name: "wallet", type: "address" },
          { name: "timestamp", type: "uint256" },
        ],
      };
      const value = {
        prnHash: prnHash,
        wallet: student1.address,
        timestamp: timestamp,
      };

      const signature = await student1.signTypedData(domain, types, value);
      const tx = await contract.connect(student1).bindIdentityZeroPii(prnHash, timestamp, signature);
      const receipt = await tx.wait();
      assert.strictEqual(receipt.status, 1);

      // Verify event
      const filter = contract.filters.ZeroPiiIdentityBound();
      const events = await contract.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].args.prnHash, prnHash);
      assert.strictEqual(events[0].args.wallet.toLowerCase(), student1.address.toLowerCase());

      // Verify lookup view functions
      const boundWallet = await contract.getBoundWalletByHash(prnHash);
      assert.strictEqual(boundWallet.toLowerCase(), student1.address.toLowerCase());

      const boundHash = await contract.getBoundPRNHash(student1.address);
      assert.strictEqual(boundHash, prnHash);
    });

    it("should reject zero-PII binding with zero hash", async function () {
      const dummySig = "0x" + "00".repeat(65);
      await assert.rejects(
        async () => {
          await contract.connect(student1).bindIdentityZeroPii(ethers.ZeroHash, 12345, dummySig);
        },
        (err) => err.message.includes("IdentityRegistry: PRN hash cannot be zero")
      );
    });
  });
});

