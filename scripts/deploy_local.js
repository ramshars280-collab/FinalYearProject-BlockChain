/**
 * Dedicated Local Hardhat Deployment Engine for SOET VeriTrust
 * Deploys IdentityRegistry and CredentialRegistry to a local Hardhat node (http://127.0.0.1:8545).
 * 
 * Strict Safety Rules:
 * - Chain ID must be EXACTLY 31337.
 * - Rejects Ethereum Sepolia (11155111), Ethereum Mainnet (1), and all remote networks.
 * - Uses Hardhat's default funded test account #0 (no private keys required).
 * - Saves addresses to src/contracts/deployedAddresses.local.json without touching deployedAddresses.json.
 * - Exports ABIs to src/contracts/abis/.
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Artifact Paths
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts/contracts");
const IDENTITY_ARTIFACT_PATH = path.join(ARTIFACTS_DIR, "IdentityRegistry.sol/IdentityRegistry.json");
const CREDENTIAL_ARTIFACT_PATH = path.join(ARTIFACTS_DIR, "CredentialRegistry.sol/CredentialRegistry.json");

// Export Paths
const EXPORT_DIR = path.join(__dirname, "../src/contracts");
const ABIS_DIR = path.join(EXPORT_DIR, "abis");
const DEPLOYED_ADDRESSES_LOCAL_PATH = path.join(EXPORT_DIR, "deployedAddresses.local.json");
const DEPLOYMENT_HISTORY_LOCAL_PATH = path.join(EXPORT_DIR, "deploymentHistory.local.json");

// Hardhat default test account #0 private key
const HARDHAT_DEFAULT_PRIVATE_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const LOCAL_RPC_URL = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";

function ensureDirectories() {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
  if (!fs.existsSync(ABIS_DIR)) fs.mkdirSync(ABIS_DIR, { recursive: true });
}

function loadArtifacts() {
  if (!fs.existsSync(IDENTITY_ARTIFACT_PATH) || !fs.existsSync(CREDENTIAL_ARTIFACT_PATH)) {
    console.error("❌ Compiled artifacts not found in artifacts/contracts/.");
    console.error("Please run: npx hardhat compile\n");
    process.exit(1);
  }
  const identityArtifact = JSON.parse(fs.readFileSync(IDENTITY_ARTIFACT_PATH, "utf8"));
  const credentialArtifact = JSON.parse(fs.readFileSync(CREDENTIAL_ARTIFACT_PATH, "utf8"));
  return { identityArtifact, credentialArtifact };
}

function exportAbis(identityArtifact, credentialArtifact) {
  ensureDirectories();
  const identityAbiPath = path.join(ABIS_DIR, "IdentityRegistry.json");
  const credentialAbiPath = path.join(ABIS_DIR, "CredentialRegistry.json");
  fs.writeFileSync(identityAbiPath, JSON.stringify(identityArtifact.abi, null, 2), "utf8");
  fs.writeFileSync(credentialAbiPath, JSON.stringify(credentialArtifact.abi, null, 2), "utf8");
  console.log("📁 Contract ABIs exported to:");
  console.log(`   - ${identityAbiPath}`);
  console.log(`   - ${credentialAbiPath}`);
}

function saveLocalAddresses(data) {
  ensureDirectories();
  // 1. Back up existing local addresses if present
  if (fs.existsSync(DEPLOYED_ADDRESSES_LOCAL_PATH)) {
    const backupPath = path.join(EXPORT_DIR, "deployedAddresses.local.backup.json");
    fs.copyFileSync(DEPLOYED_ADDRESSES_LOCAL_PATH, backupPath);
  }

  // 2. Write active deployedAddresses.local.json
  fs.writeFileSync(DEPLOYED_ADDRESSES_LOCAL_PATH, JSON.stringify(data, null, 2), "utf8");
  console.log(`📝 Local deployed addresses written to: ${DEPLOYED_ADDRESSES_LOCAL_PATH}`);

  // 3. Append to deploymentHistory.local.json
  let history = [];
  if (fs.existsSync(DEPLOYMENT_HISTORY_LOCAL_PATH)) {
    try {
      history = JSON.parse(fs.readFileSync(DEPLOYMENT_HISTORY_LOCAL_PATH, "utf8"));
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }
  }
  history.push(data);
  fs.writeFileSync(DEPLOYMENT_HISTORY_LOCAL_PATH, JSON.stringify(history, null, 2), "utf8");
  console.log(`📜 Local deployment history preserved at: ${DEPLOYMENT_HISTORY_LOCAL_PATH}`);
}

async function main() {
  console.log("=================================================================");
  console.log("   SOET VeriTrust: Local Hardhat Smart Contract Deployment       ");
  console.log("=================================================================\n");

  const { identityArtifact, credentialArtifact } = loadArtifacts();

  console.log(`📡 Connecting to local JSON-RPC provider at: ${LOCAL_RPC_URL}`);
  const provider = new ethers.JsonRpcProvider(LOCAL_RPC_URL);

  let network;
  try {
    network = await provider.getNetwork();
  } catch (err) {
    console.error(`\n❌ ERROR: Could not connect to local Hardhat node at ${LOCAL_RPC_URL}.`);
    console.error("Please ensure your local Hardhat node is running in a separate terminal via:");
    console.error("   npx hardhat node\n");
    process.exit(1);
  }

  const chainIdNumber = Number(network.chainId);
  console.log(`🌐 Connected Network: ${network.name} (Chain ID: ${chainIdNumber})`);

  // STRICT SAFETY ENFORCEMENT: Only chain ID 31337 is permitted!
  if (chainIdNumber !== 31337) {
    console.error(`\n❌ CRITICAL SAFETY ERROR: Target network chain ID is ${chainIdNumber}.`);
    console.error(`Expected chain ID 31337 (Hardhat Localhost). Local deployment script refused execution.`);
    if (chainIdNumber === 11155111) {
      console.error(`⚠️ Detected Sepolia testnet! For Sepolia deployment, use: node scripts/deploy.js`);
    }
    process.exit(1);
  }

  // Use Hardhat's default pre-funded test account #0
  const wallet = new ethers.Wallet(HARDHAT_DEFAULT_PRIVATE_KEY_0, provider);
  console.log(`👤 Local Deployer Account: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Deployer Balance:       ${ethers.formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    console.error("❌ ERROR: Local deployer account balance is 0. Ensure Hardhat node was started cleanly.");
    process.exit(1);
  }

  const getFreshNonce = async () =>
    parseInt(await provider.send("eth_getTransactionCount", [wallet.address, "latest"]), 16);

  // 1. Deploy IdentityRegistry
  console.log("-----------------------------------------------------------------");
  console.log("📦 [1/2] Deploying IdentityRegistry.sol to local Hardhat node...");
  const identityFactory = new ethers.ContractFactory(
    identityArtifact.abi,
    identityArtifact.bytecode,
    wallet
  );
  const nonce1 = await getFreshNonce();
  const identityContract = await identityFactory.deploy({ nonce: nonce1 });
  const identityTx = identityContract.deploymentTransaction();
  const identityReceipt = identityTx ? await identityTx.wait(1) : null;
  await identityContract.waitForDeployment();
  const identityAddress = await identityContract.getAddress();
  const identityBlock = identityReceipt ? identityReceipt.blockNumber : null;

  if (!identityReceipt || identityReceipt.status !== 1) {
    throw new Error(`IdentityRegistry deployment failed or reverted on-chain (status: ${identityReceipt?.status})`);
  }
  console.log(`   ✅ IdentityRegistry deployed at: ${identityAddress} (Block: ${identityBlock}, Tx: ${identityTx?.hash})`);

  // 2. Deploy CredentialRegistry
  console.log("\n📦 [2/2] Deploying CredentialRegistry.sol to local Hardhat node...");
  const credentialFactory = new ethers.ContractFactory(
    credentialArtifact.abi,
    credentialArtifact.bytecode,
    wallet
  );
  const nonce2 = await getFreshNonce();
  const credentialContract = await credentialFactory.deploy({ nonce: nonce2 });
  const credentialTx = credentialContract.deploymentTransaction();
  const credentialReceipt = credentialTx ? await credentialTx.wait(1) : null;
  await credentialContract.waitForDeployment();
  const credentialAddress = await credentialContract.getAddress();
  const credentialBlock = credentialReceipt ? credentialReceipt.blockNumber : null;

  if (!credentialReceipt || credentialReceipt.status !== 1) {
    throw new Error(`CredentialRegistry deployment failed or reverted on-chain (status: ${credentialReceipt?.status})`);
  }
  console.log(`   ✅ CredentialRegistry deployed at: ${credentialAddress} (Block: ${credentialBlock}, Tx: ${credentialTx?.hash})`);
  console.log("-----------------------------------------------------------------\n");

  // 3. Verify deployed bytecode
  console.log("🔍 Verifying deployed bytecode on local node...");
  const idCode = await provider.getCode(identityAddress);
  const credCode = await provider.getCode(credentialAddress);
  if (!idCode || idCode === "0x" || idCode.length <= 2) throw new Error("IdentityRegistry has empty bytecode!");
  if (!credCode || credCode === "0x" || credCode.length <= 2) throw new Error("CredentialRegistry has empty bytecode!");
  console.log(`   ✓ IdentityRegistry bytecode verified (${(idCode.length - 2) / 2} bytes)`);
  console.log(`   ✓ CredentialRegistry bytecode verified (${(credCode.length - 2) / 2} bytes)`);

  // 4. Export ABIs
  exportAbis(identityArtifact, credentialArtifact);

  // 5. Save local addresses manifest
  const deploymentRecord = {
    network: "localhost",
    chainId: 31337,
    identityRegistry: identityAddress,
    credentialRegistry: credentialAddress,
    deployer: wallet.address,
    deployedAt: new Date().toISOString(),
    txHashes: {
      identityRegistry: identityTx ? identityTx.hash : null,
      credentialRegistry: credentialTx ? credentialTx.hash : null,
    },
    blockNumbers: {
      identityRegistry: identityBlock,
      credentialRegistry: credentialBlock,
    },
    note: "Local Hardhat node deployment manifest",
  };

  saveLocalAddresses(deploymentRecord);

  console.log("\n🎉 LOCAL HARDHAT DEPLOYMENT COMPLETE!");
  console.log(`   • IdentityRegistry:   ${identityAddress}`);
  console.log(`   • CredentialRegistry: ${credentialAddress}`);
  console.log(`   • Chain ID:           31337 (Localhost)`);
  console.log(`   • Local Manifest:     src/contracts/deployedAddresses.local.json`);
  console.log(`   • Sepolia Manifest:   src/contracts/deployedAddresses.json (PRESERVED & UNTOUCHED)`);
}

main().catch((err) => {
  console.error("\n❌ Local deployment encountered a fatal error:", err);
  process.exit(1);
});

