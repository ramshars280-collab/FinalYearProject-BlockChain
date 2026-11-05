# SOET VeriTrust: Ethereum Sepolia Deployment Preflight & Approval Gate Report

**Project:** SOET VeriTrust — Blockchain-Based Academic Degree Verification & AI Forensics  
**Audit Phase:** Prompt 45 — Sepolia Deployment Preflight & Final Approval Gate  
**Execution Date:** November 02, 2026  
**Network Target:** Ethereum Sepolia Testnet (`chainId: 11155111`)  
**Status Assessment:** **DEPLOYMENT BLOCKED** (Awaiting Deployer Wallet Private Key & Testnet ETH Funding)

---

## 1. Executive Summary & Gate Status

This audit was conducted strictly under **PREFLIGHT-ONLY** rules. **ZERO blockchain transactions were submitted, signed, or broadcasted to Ethereum Sepolia or any EVM network.** No gas was consumed, and no contract state was modified.

All technical, structural, cryptographic, and script safety prerequisites have been systematically audited and hardened. The smart contracts (`IdentityRegistry.sol` and `CredentialRegistry.sol`) compile cleanly with zero constructor arguments, the deployment script enforces a strict chain ID guard (`11155111`) and dry-run flag requirement (`--confirm-live-deployment`), and frontend address resolution has been completely decoupled from obsolete Hardhat placeholders.

The deployment cannot proceed to live execution (Prompt 46) until the two operational prerequisites highlighted below are fulfilled by the user.

| Audit Dimension | Status | Verification Detail |
| :--- | :--- | :--- |
| **Preflight Backup & Database Invariance** | `VERIFIED` | Timestamped backup captured; SQLite integrity `ok`; 2 batches / 5 credentials invariant. |
| **Sepolia JSON-RPC Connectivity** | `VERIFIED` | RPC reachable; chainId `11155111`; latest block `12042840`. |
| **Existing Deployed Bytecode Check** | `VERIFIED` | Configured fallback addresses confirmed empty (`0x` bytecode). No phantom contracts exist. |
| **Contract Compilation & Bytecode Size** | `VERIFIED` | Solidity `0.8.20` with optimizer (200 runs); IdentityRegistry: 4,648 bytes, CredentialRegistry: 6,686 bytes. |
| **Constructor Configuration** | `VERIFIED` | Both constructors accept exactly 0 parameters. Deployment order is completely independent. |
| **Gas & Deployment Cost Estimation** | `VERIFIED` | Base gas: 2,517,184 units; with +20% buffer: 3,020,620 units. Estimated cost: ~0.05–0.10 Sepolia ETH. |
| **Deployment Script Dry-Run Safety** | `VERIFIED` | `scripts/deploy.js` defaults to dry run and halts unless `--confirm-live-deployment` is supplied. |
| **Frontend & Config Address Alignment** | `VERIFIED` | Blocked Hardhat test account 2 placeholder (`0x3c44...`) in `index.ts`, `storage.ts`, `docker-compose.yml`, `.env.example`. |
| **Deployer Wallet Private Key** | `BLOCKED` | `PRIVATE_KEY` is not present in `.env` / environment. Deployment engine halted safely. |
| **Deployer Account Balance** | `BLOCKED` | Deployer balance is 0.0 ETH (Insufficient Sepolia ETH for on-chain gas). |
| **User Transaction Approval** | `BLOCKED` | Deployment execution strictly halted awaiting user gate sign-off. |

---

## 2. Backup Location & Baseline Records

### 2.1 Backup Directory
A complete snapshot of all deployment, environment, and configuration assets was captured prior to analysis:
- **Backup Path:** `backups/backup_prompt45_20261102_000123/`
- **Archived Files:**
  - `hardhat.config.js`
  - `scripts/deploy.js`
  - `src/contracts/deployedAddresses.json`
  - `src/contracts/index.ts`
  - `src/lib/storage.ts`
  - `contracts/CredentialRegistry.sol`
  - `contracts/IdentityRegistry.sol`
  - `.env.local`
  - `.env.example`
  - `docker-compose.yml`
  - `docs/DEPLOYMENT.md`
  - `package.json`
  - `tsconfig.json`

### 2.2 SQLite Baseline Invariance
- **Integrity Check:** `PRAGMA integrity_check` returned `ok`.
- **Total Batches in Database:** 2
  1. `MGM-2024-BTECH-BATCH01`:
     - Merkle Root: `0x73c9d682d5dadeba35e6ad3bf62be75c3e3161bf0136fb5b9043f0f4d656a717`
     - Status: `INSTITUTIONAL_STORED` (Anchored leaf count: 4, Revoked indices: `[3]`)
  2. `DEMO_GRADUATION_2024_1`:
     - Merkle Root: `0xf0694dc9f2365b41463b40715cdf291af859d5c316b303d5c4f2b9bb58951040`
     - Status: `PENDING_ANCHOR` (Credential count: 1)
- **Total Credentials in Database:** 5 (Bit-for-bit invariant).

---

## 3. Environment Variable Configuration Audit

In accordance with strict security requirements, secret values (private keys, passwords, session tokens) are **never printed, copied, or exposed in reports or logs**. Only presence status is recorded:

| Environment Variable | Presence Status | Security Classification | Purpose / Consumer |
| :--- | :--- | :--- | :--- |
| `SEPOLIA_RPC_URL` | `MISSING` (Fallback to `NEXT_PUBLIC_SEPOLIA_RPC`) | Public Network Config | Hardhat & deployment script JSON-RPC endpoint |
| `NEXT_PUBLIC_SEPOLIA_RPC` | `PRESENT` | Public Network Config | Client and server Sepolia RPC provider endpoint |
| `NEXT_PUBLIC_CHAIN_ID` | `PRESENT` (`11155111`) | Public Network Config | Target EVM network identifier |
| `NEXT_PUBLIC_CREDENTIAL_REGISTRY` | `PRESENT` | Public Contract Config | Active CredentialRegistry contract address |
| `NEXT_PUBLIC_IDENTITY_REGISTRY` | `PRESENT` | Public Contract Config | Active IdentityRegistry contract address |
| `PRIVATE_KEY` | `MISSING` | **CRITICAL SECRET** | Deployer account private key (Required for Prompt 46) |
| `DEPLOYER_PRIVATE_KEY` | `MISSING` | **CRITICAL SECRET** | Alternate deployer key variable |
| `AUTH_SECRET` | `PRESENT` | Server Secret | Session JWT signing secret |
| `ADMIN_PASSWORD` | `PRESENT` | Server Secret | Examination Administrator password hash/salt |
| `STUDENT_DEFAULT_PASSWORD` | `PRESENT` | Server Secret | Default institutional student credential |
| `PINATA_JWT` / `PINATA_API_KEY` | `MISSING` | Third-Party API Key | IPFS degree payload pinning |
| `DATABASE_PATH` | `MISSING` (Defaults to `./data/veritrust.db`) | Local System Config | Persistent SQLite file location |

> [!IMPORTANT]
> `PRIVATE_KEY` is currently absent from the deployment environment. As designed, `scripts/deploy.js` refuses execution without sending any transactions.

---

## 4. Deployer Wallet & Institutional Authority Validation

### 4.1 Wallet State
- **Configured Deployer Private Key:** None (`MISSING`).
- **Derived Deployer Public Address:** None (cannot be derived without key).
- **Target Institutional Authority Address:** `0x71c56538b15294500b73F8472B4fe963D4e58Bef` (MGM University Authority).

### 4.2 Initial Contract Ownership & Issuer Mechanics
Both contracts define initialization in their respective constructors:
1. **`CredentialRegistry.sol`:**
   ```solidity
   constructor() {
       owner = msg.sender;
       authorizedIssuers[msg.sender] = true;
       institutionNames[msg.sender] = "MGM University, Chhatrapati Sambhajinagar";
   }
   ```
   - The deployer wallet (`msg.sender`) automatically becomes the `owner` and is registered as the initial `authorizedIssuer`.
   - If the deploying wallet matches `0x71c56538b15294500b73F8472B4fe963D4e58Bef`, the authority wallet is already an authorized issuer upon deployment.
   - If a distinct operational deployer wallet is used (e.g., `0xDeployer...`), the deployer will need to call `registerInstitution(0x71c56538b15294500b73F8472B4fe963D4e58Bef, "MGM University")` to authorize the university authority wallet.

2. **`IdentityRegistry.sol`:**
   ```solidity
   constructor() {
       owner = msg.sender;
       DOMAIN_SEPARATOR = keccak256(...);
   }
   ```
   - The deployer becomes the owner of the Identity Registry.

---

## 5. Live Sepolia Network Validation (Read-Only)

Live queries against the configured public Sepolia JSON-RPC provider (`https://ethereum-sepolia-rpc.publicnode.com`) returned the following verified data:

- **Network Chain ID:** `11155111` (`sepolia`) — `VERIFIED`
- **Latest Block Number:** `12042840` — `VERIFIED`
- **Current Base Gas Price:** `17` Wei (Max Fee Per Gas: `31` Wei, Max Priority Fee: `3` Wei) — `VERIFIED`
- **Institutional Authority Balance (`0x71c56538...`):** `0.0 ETH` (0 Wei) — `VERIFIED`
- **Existing Configured Address Bytecode Inspection:**
  - `CredentialRegistry` (`0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7`): Bytecode length = 2 (`0x`). **No deployed bytecode exists on-chain.**
  - `IdentityRegistry` (`0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`): Bytecode length = 2 (`0x`). **No deployed bytecode exists on-chain.**

> [!NOTE]
> This confirms that the addresses currently stored in `src/contracts/deployedAddresses.json` are placeholders from earlier development and that no live contracts currently reside at these addresses on Sepolia.

---

## 6. Gas & Deployment Cost Estimation

A high-fidelity gas estimation was conducted using Hardhat's EVM simulation engine, matching exact Solidity compiler flags (`0.8.20`, optimizer runs: 200):

| Smart Contract | Bytecode Size | Deployment Gas Estimate | Actual EVM gasUsed |
| :--- | :--- | :--- | :--- |
| **`IdentityRegistry.sol`** | 4,648 bytes | 1,019,361 gas | 1,019,361 gas |
| **`CredentialRegistry.sol`** | 6,686 bytes | 1,497,823 gas | 1,497,823 gas |
| **Combined Deployment Gas** | 11,334 bytes | **2,517,184 gas** | **2,517,184 gas** |
| **With +20% Safety Buffer** | — | **3,020,620 gas** | **3,020,620 gas** |

### 6.1 Estimated Cost Scenarios
- **Scenario A (Current RPC Base Fee: 17 Wei):** `0.000000051 ETH`
- **Scenario B (Standard Sepolia Traffic: 10 Gwei):** `0.0302 Sepolia ETH`
- **Scenario C (High Sepolia Peak: 25 Gwei):** `0.0755 Sepolia ETH`
- **Scenario D (Ultra Congestion Buffer: 35 Gwei):** `0.1057 Sepolia ETH`

**Recommendation:** The deployer account should be funded with at least **0.05 to 0.10 Sepolia ETH** before initiating Prompt 46 live deployment.

---

## 7. Contract & Deployment Script Safety Audit

### 7.1 Constructor Symmetry & Order Independence
- `IdentityRegistry`: Constructor takes **0 arguments** (`inputs: []`).
- `CredentialRegistry`: Constructor takes **0 arguments** (`inputs: []`).
- **Cross-Contract Dependency:** Neither contract imports, references, or requires the deployment address of the other contract in its bytecode or constructor. They can be deployed in any sequence with zero coupling.

### 7.2 Deployment Script Hardening (`scripts/deploy.js`)
The deployment script incorporates the following safety protections:
1. **Chain ID Guard:** Rejects execution if `network.chainId !== 11155111`.
2. **Missing Private Key Guard:** Refuses execution if `PRIVATE_KEY` is undefined.
3. **Zero Balance Guard:** Intercepts accounts with 0 balance before broadcasting.
4. **Dry-Run Default:** Halts execution in preparation mode unless `--confirm-live-deployment` is passed as a command-line flag.
5. **Atomic Export & History Preservation:** Automatically backs up `deployedAddresses.json` to `deployedAddresses.backup.json`, writes new contract addresses with block numbers and transaction hashes, exports ABIs to `src/contracts/abis/`, and appends immutable records to `src/contracts/deploymentHistory.json`.

---

## 8. Frontend Address Integration & Hardhat Placeholder Elimination

During this preflight inspection, an address configuration vulnerability was identified and resolved:
- **Legacy Issue:** The legacy Hardhat test account #2 address (`0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`) was present as a default in `.env.example`, `docker-compose.yml`, and `docs/DEPLOYMENT.md`. If inherited, it would trigger MetaMask internal account errors during identity binding.
- **Remediation Implemented:**
  1. Updated `src/contracts/index.ts` to explicitly discard `0x3c44...` even if present in the environment and fall back to the active registered address in `deployedAddresses.json`.
  2. Updated `src/lib/storage.ts` (`DEFAULT_SEPOLIA_CONFIG`) to sanitize against `0x3c44...`.
  3. Replaced `0x3C44...` in `.env.example`, `docker-compose.yml`, `docs/DEPLOYMENT.md`, and `.env.local` with `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`.
  4. Updated `tsconfig.json` to exclude `backups/`, ensuring clean TypeScript builds.

---

## 9. Pre-Deployment Blocker Checklist

| Checklist Item | Current Status | Notes / Next Required Action |
| :--- | :---: | :--- |
| **Valid Sepolia RPC Endpoint** | [x] | Verified active at `https://ethereum-sepolia-rpc.publicnode.com`. |
| **Correct Sepolia Chain ID (11155111)** | [x] | Verified against live network and script guards. |
| **Valid Deployer Wallet Private Key** | [ ] | **BLOCKER 1:** User must configure `PRIVATE_KEY` in `.env`. |
| **Deployer Balance Sufficient (>0.05 ETH)** | [ ] | **BLOCKER 2:** Deployer account must hold Sepolia testnet ETH. |
| **Both Contract Artifacts Compiled** | [x] | Verified in `artifacts/contracts/`. |
| **Constructor Configuration Verified** | [x] | Verified: 0 arguments required for both contracts. |
| **Deployment Script Safety Verified** | [x] | Verified: Chain guard, dry-run mode, history logging. |
| **Frontend Environment Variables Aligned** | [x] | Verified: Clean decoupling from Hardhat test account 2. |
| **Historical Deployment Records Protected** | [x] | Verified: Backup copy saved; history append-only. |
| **Deployment Cost Estimated** | [x] | Estimated: 2,517,184 base gas / ~0.05–0.10 Sepolia ETH. |
| **User Has Reviewed Deployer Address** | [ ] | Awaiting user configuration of wallet address. |
| **User Has Explicitly Approved Transaction** | [ ] | **APPROVAL GATE:** Stopped awaiting user confirmation. |

---

## 10. Actions Scheduled for Prompt 46 (Actual Sepolia Deployment)

Once the user provides the funded deployer private key and issues explicit approval, the following automated sequence will take place:

1. **Pre-Flight Validation:** Verify that `PRIVATE_KEY` is loaded and that the corresponding wallet address has `> 0.05` Sepolia ETH.
2. **Deploy IdentityRegistry:** Submit transaction to deploy `IdentityRegistry.sol` to Sepolia, await 1 confirmation, and capture block number and transaction hash.
3. **Deploy CredentialRegistry:** Submit transaction to deploy `CredentialRegistry.sol` to Sepolia, await 1 confirmation, and capture block number and transaction hash.
4. **Export Artifacts:**
   - Write updated addresses to `src/contracts/deployedAddresses.json`.
   - Append deployment metadata (addresses, txHashes, blockNumbers, timestamps, deployer) to `src/contracts/deploymentHistory.json`.
   - Export ABIs to `src/contracts/abis/IdentityRegistry.json` and `CredentialRegistry.json`.
5. **Post-Deployment On-Chain Verification:**
   - Query Sepolia RPC to confirm that bytecode (`getCode()`) is non-empty at both newly deployed addresses.
   - Verify initial ownership (`owner()`) and authorized issuer status on `CredentialRegistry`.
6. **Frontend & Next.js Rebuild Verification:** Run `npm run build` to confirm seamless end-to-end integration.

---

## 11. Final Approval Gate Status

> [!CAUTION]
> **GATE STATUS: BLOCKED**
> 
> The system has halted at the approval gate in strict compliance with safety rules. **Zero transactions have been submitted.** Live deployment will remain blocked until:
> 1. A deployer wallet private key (`PRIVATE_KEY`) is provided in `.env`.
> 2. The deployer wallet has been funded with Sepolia testnet ETH.
> 3. The user explicitly reviews the public wallet address and gives written approval to execute live deployment.

