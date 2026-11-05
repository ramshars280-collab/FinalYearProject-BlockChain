/**
 * Production Sepolia Deployment Script for IdentityRegistry and CredentialRegistry
 * Using Ethers.js v6 syntax with automatic artifact, ABI, and address export.
 *
 * Usage:
 *   node scripts/deploy.js               (deploy to Sepolia using .env)
 *   node scripts/deploy.js --export-only (export ABIs & deployedAddresses without deploying)
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Contract Artifact Paths (relative to scripts directory)
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts/contracts");
const IDENTITY_ARTIFACT_PATH = path.join(
  ARTIFACTS_DIR,
  "IdentityRegistry.sol/IdentityRegistry.json"
);
const CREDENTIAL_ARTIFACT_PATH = path.join(
  ARTIFACTS_DIR,
  "CredentialRegistry.sol/CredentialRegistry.json"
);

// Target Export Paths for Next.js App
const EXPORT_DIR = path.join(__dirname, "../src/contracts");
const ABIS_DIR = path.join(EXPORT_DIR, "abis");
const DEPLOYED_ADDRESSES_PATH = path.join(EXPORT_DIR, "deployedAddresses.json");
const DEPLOYMENT_HISTORY_PATH = path.join(EXPORT_DIR, "deploymentHistory.json");

/**
 * Ensures all required directories exist.
 */
function ensureDirectories() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
  if (!fs.existsSync(ABIS_DIR)) {
    fs.mkdirSync(ABIS_DIR, { recursive: true });
  }
}

/**
 * Loads compiled Hardhat contract artifacts.
 */
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

/**
 * Exports contract ABIs into src/contracts/abis/ for zero-breakage consumption in Next.js.
 */
function exportAbis(identityArtifact, credentialArtifact) {
  ensureDirectories();

  const identityAbiPath = path.join(ABIS_DIR, "IdentityRegistry.json");
  const credentialAbiPath = path.join(ABIS_DIR, "CredentialRegistry.json");

  fs.writeFileSync(
    identityAbiPath,
    JSON.stringify(identityArtifact.abi, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    credentialAbiPath,
    JSON.stringify(credentialArtifact.abi, null, 2),
    "utf8"
  );

  console.log("📁 Contract ABIs exported to:");
  console.log(`   - ${identityAbiPath}`);
  console.log(`   - ${credentialAbiPath}`);
}

/**
 * Writes or updates deployed contract addresses to src/contracts/deployedAddresses.json
 * while preserving historical deployment backups and history logs.
 */
function saveDeployedAddresses(data) {
  ensureDirectories();

  // 1. Back up existing active addresses if present
  if (fs.existsSync(DEPLOYED_ADDRESSES_PATH)) {
    const backupPath = path.join(EXPORT_DIR, "deployedAddresses.backup.json");
    fs.copyFileSync(DEPLOYED_ADDRESSES_PATH, backupPath);
  }

  // 2. Write active deployedAddresses.json
  fs.writeFileSync(DEPLOYED_ADDRESSES_PATH, JSON.stringify(data, null, 2), "utf8");
  console.log(`📝 Deployed addresses written to: ${DEPLOYED_ADDRESSES_PATH}`);

  // 3. Append to deploymentHistory.json
  let history = [];
  if (fs.existsSync(DEPLOYMENT_HISTORY_PATH)) {
    try {
      history = JSON.parse(fs.readFileSync(DEPLOYMENT_HISTORY_PATH, "utf8"));
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }
  }
  history.push(data);
  fs.writeFileSync(DEPLOYMENT_HISTORY_PATH, JSON.stringify(history, null, 2), "utf8");
  console.log(`📜 Deployment history preserved at: ${DEPLOYMENT_HISTORY_PATH}`);
}

async function main() {
  console.log("=================================================================");
  console.log("  Academic Credential Verification - Sepolia Deployment Engine   ");
  console.log("=================================================================\n");

  const { identityArtifact, credentialArtifact } = loadArtifacts();

  // Handle --export-only flag (useful for setting up Next.js imports before deploying)
  if (process.argv.includes("--export-only")) {
    console.log("⚡ Running in --export-only mode. Exporting ABIs and base schema...");
    exportAbis(identityArtifact, credentialArtifact);

    // Write initial/fallback deployedAddresses if file does not exist
    if (!fs.existsSync(DEPLOYED_ADDRESSES_PATH)) {
      saveDeployedAddresses({
        network: "sepolia",
        chainId: 11155111,
        identityRegistry: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        credentialRegistry: process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY || "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7",
        deployer: "0x0000000000000000000000000000000000000000",
        deployedAt: new Date().toISOString(),
        note: "Fallback addresses populated before initial deployment",
      });
    }
    console.log("\n✅ ABI export completed successfully.");
    return;
  }

  // Check Environment Configuration
  const rpcUrl =
    process.env.SEPOLIA_RPC_URL ||
    process.env.NEXT_PUBLIC_SEPOLIA_RPC ||
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ||
    "https://ethereum-sepolia-rpc.publicnode.com";

  let privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    console.error("❌ ERROR: PRIVATE_KEY is missing in your environment or .env file.");
    console.error("\nTo deploy live to Ethereum Sepolia:");
    console.error("1. Open or create your .env file in the project root.");
    console.error("2. Add your deployer private key and RPC URL:");
    console.error("   PRIVATE_KEY=0xYourPrivateKeyHere");
    console.error("   SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com");
    console.error("3. Run: node scripts/deploy.js\n");
    process.exit(1);
  }

  if (!privateKey.startsWith("0x")) {
    privateKey = `0x${privateKey}`;
  }

  // Initialize Provider and Deployer Signer
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  // Network Verification
  const network = await provider.getNetwork();
  const chainIdNumber = Number(network.chainId);
  const institutionalAuthority = "0x8D0cC3553e9d812797B986F15427835A2930a301";
  const matchesAuthority = wallet.address.toLowerCase() === institutionalAuthority.toLowerCase();

  console.log(`🌐 Connected Network: ${network.name} (Chain ID: ${chainIdNumber})`);
  console.log(`📡 RPC Endpoint:     ${rpcUrl}`);
  console.log(`👤 Deployer Address: ${wallet.address}`);
  console.log(`🏛️  Authority Status: ${matchesAuthority ? "Matches Institutional Authority" : "Differs from Authority (" + institutionalAuthority + ")"}`);

  // Enforce Sepolia Chain ID (11155111)
  if (chainIdNumber !== 11155111) {
    console.error(`\n❌ CRITICAL SAFETY ERROR: Target network chain ID is ${chainIdNumber}.`);
    console.error(`Expected chain ID 11155111 (Ethereum Sepolia). Deployment refused for safety.`);
    process.exit(1);
  }

  // Balance Verification
  const balanceWei = await provider.getBalance(wallet.address);
  const balanceEth = ethers.formatEther(balanceWei);
  console.log(`💰 Account Balance:  ${balanceEth} ETH\n`);

  if (balanceWei === 0n) {
    console.error("❌ ERROR: Insufficient Sepolia ETH balance.");
    console.error(`The deployer address (${wallet.address}) has 0.0 ETH.`);
    console.error("Please fund your wallet with Sepolia testnet ETH from one of the faucets:");
    console.error("  - https://sepoliafaucet.com");
    console.error("  - https://infura.io/faucet/sepolia");
    console.error("  - https://faucets.chain.link\n");
    process.exit(1);
  }

  // Pre-Deployment Safety Guard: Refuse transaction execution without explicit confirmation flag
  const isConfirmed = process.argv.includes("--confirm-live-deployment");
  if (!isConfirmed) {
    console.log("-----------------------------------------------------------------");
    console.log("⚠️  PREPARATION MODE (DRY RUN): NO TRANSACTIONS SUBMITTED");
    console.log("   • Network & Chain ID verified: 11155111 (Sepolia)");
    console.log(`   • Deployer account: ${wallet.address}`);
    console.log(`   • Account balance:  ${balanceEth} ETH`);
    console.log(`   • Authority Match:  ${matchesAuthority ? "YES (Deployer is MGM Authority)" : "NO (registerInstitution required post-deploy)"}`);
    console.log(`   • Constructor parameters: None required (IdentityRegistry & CredentialRegistry have 0-arg constructors)`);
    console.log("\nTo execute actual on-chain deployment and spend Sepolia gas, run:");
    console.log("   node scripts/deploy.js --confirm-live-deployment\n");
    return;
  }

  // 1. Deploy IdentityRegistry
  console.log("-----------------------------------------------------------------");
  console.log("📦 [1/2] Deploying IdentityRegistry.sol...");
  const identityFactory = new ethers.ContractFactory(
    identityArtifact.abi,
    identityArtifact.bytecode,
    wallet
  );

  const identityContract = await identityFactory.deploy();
  const identityTx = identityContract.deploymentTransaction();
  console.log(`   ⏳ Transaction submitted: ${identityTx ? identityTx.hash : "Pending"}`);
  console.log("   ⏳ Waiting for block confirmation on Sepolia...");
  const identityReceipt = identityTx ? await identityTx.wait(1) : null;
  await identityContract.waitForDeployment();
  const identityAddress = await identityContract.getAddress();
  const identityBlock = identityReceipt ? identityReceipt.blockNumber : null;

  if (!identityReceipt || identityReceipt.status !== 1) {
    throw new Error(
      `IdentityRegistry deployment transaction reverted or failed on Sepolia (status: ${identityReceipt?.status})`
    );
  }
  console.log(`   ✅ IdentityRegistry deployed at: ${identityAddress} (Block: ${identityBlock})`);

  // Write intermediate recovery state in case second contract deployment encounters errors
  const intermediatePath = path.join(EXPORT_DIR, "partialDeployment.json");
  try {
    fs.writeFileSync(
      intermediatePath,
      JSON.stringify(
        {
          stage: "IDENTITY_REGISTRY_DEPLOYED",
          identityRegistry: identityAddress,
          txHash: identityTx ? identityTx.hash : null,
          blockNumber: identityBlock,
          deployer: wallet.address,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    );
  } catch (e) {
    // Non-fatal warning if intermediate write fails
  }

  // 2. Deploy CredentialRegistry
  console.log("\n📦 [2/2] Deploying CredentialRegistry.sol...");
  let credentialContract;
  let credentialTx;
  let credentialReceipt;
  let credentialAddress;
  let credentialBlock;

  try {
    const credentialFactory = new ethers.ContractFactory(
      credentialArtifact.abi,
      credentialArtifact.bytecode,
      wallet
    );

    credentialContract = await credentialFactory.deploy();
    credentialTx = credentialContract.deploymentTransaction();
    console.log(`   ⏳ Transaction submitted: ${credentialTx ? credentialTx.hash : "Pending"}`);
    console.log("   ⏳ Waiting for block confirmation on Sepolia...");
    credentialReceipt = credentialTx ? await credentialTx.wait(1) : null;
    await credentialContract.waitForDeployment();
    credentialAddress = await credentialContract.getAddress();
    credentialBlock = credentialReceipt ? credentialReceipt.blockNumber : null;

    if (!credentialReceipt || credentialReceipt.status !== 1) {
      throw new Error(
        `CredentialRegistry deployment transaction reverted or failed on Sepolia (status: ${credentialReceipt?.status})`
      );
    }
    console.log(`   ✅ CredentialRegistry deployed at: ${credentialAddress} (Block: ${credentialBlock})`);
  } catch (credError) {
    console.error("\n❌ FATAL: CredentialRegistry deployment failed after IdentityRegistry was already mined!");
    console.error(`IdentityRegistry is preserved at: ${identityAddress}`);
    console.error(`Review intermediate record at: ${intermediatePath}`);
    throw credError;
  }

  // Clean up intermediate recovery state upon complete dual-contract success
  if (fs.existsSync(intermediatePath)) {
    try {
      fs.unlinkSync(intermediatePath);
    } catch {}
  }
  console.log("-----------------------------------------------------------------\n");

  // Export ABIs
  exportAbis(identityArtifact, credentialArtifact);

  // Write deployedAddresses.json
  const deploymentRecord = {
    network: "sepolia",
    chainId: Number(network.chainId),
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
    etherscanUrls: {
      identityRegistry: `https://sepolia.etherscan.io/address/${identityAddress}`,
      credentialRegistry: `https://sepolia.etherscan.io/address/${credentialAddress}`,
    },
  };

  saveDeployedAddresses(deploymentRecord);

  console.log("\n🎉 DEPLOYMENT SUMMARY & ETHERSCAN INSPECTION:");
  console.log(`   • IdentityRegistry:   ${identityAddress}`);
  console.log(`     Link: https://sepolia.etherscan.io/address/${identityAddress}`);
  console.log(`   • CredentialRegistry: ${credentialAddress}`);
  console.log(`     Link: https://sepolia.etherscan.io/address/${credentialAddress}`);
  console.log("\n💡 Next.js application has been updated with newly deployed contract addresses and ABIs.");
}

main().catch((error) => {
  console.error("\n❌ Deployment encountered a fatal error:", error);
  process.exit(1);
});

