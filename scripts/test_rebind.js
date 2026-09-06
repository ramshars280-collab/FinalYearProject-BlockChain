const hre = require("hardhat");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const provider = new ethers.BrowserProvider(hre.network.provider);
  const signer = await provider.getSigner(0);
  const signerAddress = await signer.getAddress();
  console.log("Signer address:", signerAddress);

  // Load compiled artifact
  const artifactPath = path.join(__dirname, "../artifacts/contracts/IdentityRegistry.sol/IdentityRegistry.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log("IdentityRegistry deployed to:", contractAddress);

  const domain = {
    name: "SOET VeriTrust",
    version: "1",
    chainId: (await provider.getNetwork()).chainId,
    verifyingContract: contractAddress,
  };

  const types = {
    IdentityBinding: [
      { name: "prn", type: "string" },
      { name: "wallet", type: "address" },
      { name: "timestamp", type: "uint256" },
    ],
  };

  // 1. First binding: PRN20200101
  const timestamp1 = Math.floor(Date.now() / 1000);
  const sig1 = await signer.signTypedData(domain, types, {
    prn: "PRN20200101",
    wallet: signerAddress,
    timestamp: timestamp1,
  });

  const tx1 = await contract.bindIdentity("PRN20200101", timestamp1, sig1);
  await tx1.wait();
  console.log("✓ Successfully bound PRN20200101 to wallet:", signerAddress);

  const boundWallet = await contract.getBoundWallet("PRN20200101");
  const boundPrn = await contract.getBoundPRN(signerAddress);
  console.log("  Verified getBoundWallet('PRN20200101'):", boundWallet);
  console.log("  Verified getBoundPRN(signerAddress):", boundPrn);

  // 2. Second binding attempt with SAME wallet: PRN20200102
  console.log("\nAttempting to bind second PRN (PRN20200102) with the same wallet...");
  const timestamp2 = Math.floor(Date.now() / 1000);
  const sig2 = await signer.signTypedData(domain, types, {
    prn: "PRN20200102",
    wallet: signerAddress,
    timestamp: timestamp2,
  });

  try {
    await contract.bindIdentity("PRN20200102", timestamp2, sig2);
    console.error("❌ ERROR: Second binding should have reverted!");
    process.exit(1);
  } catch (error) {
    console.log("✓ REVERT CONFIRMED!");
    console.log("  Revert error message:", error.message);
    if (error.message.includes("IdentityRegistry: wallet already bound to a PRN")) {
      console.log("  Exact revert reason matched: 'IdentityRegistry: wallet already bound to a PRN'");
    }
  }
}

main().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
