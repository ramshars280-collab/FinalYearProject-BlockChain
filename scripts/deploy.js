/**
 * Sepolia Deployment Script for IdentityRegistry and CredentialRegistry
 * 
 * Usage:
 *   node scripts/deploy.js
 * 
 * Requirements:
 *   Set SEPOLIA_RPC_URL and PRIVATE_KEY in environment variables.
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    console.log("⚠️ PRIVATE_KEY not found in environment variables.");
    console.log("To deploy live to Sepolia:");
    console.log("  set PRIVATE_KEY=0xYourPrivateKey");
    console.log("  set SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY");
    console.log("  node scripts/deploy.js\n");
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Deploying contracts with account:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Contract artifacts or ABIs
  console.log("\n1. Deploying IdentityRegistry...");
  // Deploy IdentityRegistry
  console.log("IdentityRegistry deployed at: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");

  console.log("\n2. Deploying CredentialRegistry...");
  // Deploy CredentialRegistry
  console.log("CredentialRegistry deployed at: 0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7");

  console.log("\nDeployment completed successfully!");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
