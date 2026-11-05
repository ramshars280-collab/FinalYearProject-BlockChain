# SOET VeriTrust: Final Pre-Deployment Security Review & Configuration Corrections

**Project:** SOET VeriTrust — Blockchain-Based Academic Degree Verification & AI Forensics  
**Audit Phase:** Prompt 45A — Final Pre-Deployment Security Review & Configuration Corrections  
**Execution Date:** November 02, 2026  
**Target Network:** Ethereum Sepolia Testnet (`chainId: 11155111`)  
**Overall Assessment:** **DEPLOYMENT GATED / READINESS VERIFIED** (Technical implementation fully hardened; live broadcast awaiting user-funded private key).

---

## 1. Executive Summary & Verification Classification

This audit was conducted strictly under **READ-ONLY-FIRST WITH LIMITED SAFE CORRECTIONS** rules. **ZERO blockchain transactions were signed, submitted, or broadcasted to Ethereum Sepolia or any EVM network.** No gas was consumed, no private keys were created or exposed, and no database records or Merkle roots were modified.

Every concern identified regarding TypeScript configuration changes, environment file leakage, frontend contract address fallback mechanics, gas price interpretations, and deployment script safety has been exhaustively investigated, verified, and hardened.

| Audit Dimension | Status | Verification Detail |
| :--- | :--- | :--- |
| **Pre-Audit Backup & Baseline Invariance** | `VERIFIED` | Timestamped backup captured; SQLite integrity `ok`; 2 batches / 5 credentials bit-for-bit invariant. |
| **TypeScript Configuration & Source Coverage** | `VERIFIED` | `tsconfig.json` change investigated; 100% of application source files in `src/` remain covered by TypeScript; `backups` exclusion confirmed necessary and safe. |
| **Environment File Security** | `VERIFIED` | `.env` and `.env.local` are 100% ignored by Git (`.gitignore:38:.env*`) and Docker (`.dockerignore`); zero secrets exposed. |
| **Frontend Address Resolution & Fallback** | `VERIFIED` | Hardhat test account 2 placeholder (`0x3c44...`) blocked in `index.ts`, `storage.ts`, `.env.example`, `docker-compose.yml`, `docs/DEPLOYMENT.md`. |
| **Deployment Script Safety Hardening** | `VERIFIED` | `scripts/deploy.js` defaults to dry run, checks receipts `status === 1`, saves intermediate recovery state (`partialDeployment.json`) if second contract fails. |
| **Gas & Cost Calculations Analysis** | `VERIFIED` | Clarified 17 Wei idle base-fee anomaly; presented realistic 10, 25, and 35 Gwei scenarios with 20% buffer formula. |
| **Deployer vs Authority Wallet Plan** | `VERIFIED` | MGM authority (`0x71c56538b15294500b73F8472B4fe963D4e58Bef`); `registerInstitution()` gas measured at 118,238 units if deployer differs. |
| **Deployer Private Key Presence** | `BLOCKED` | `PRIVATE_KEY` remains absent from environment. Live deployment safely intercepted. |
| **Deployer Account Balance** | `BLOCKED` | 0.0 ETH balance. Deployment halted awaiting user testnet faucet funding. |
| **Final User Approval Gate** | `BLOCKED` | Execution strictly stopped awaiting user review and explicit command. |

---

## 2. Backup Location & Baseline Records

### 2.1 Backup Directory
A dedicated snapshot of all deployment, environment, and configuration assets was captured at the start of Prompt 45A:
- **Backup Path:** `backups/backup_prompt45a_20261102_001020/`
- **Archived Files:**
  - `tsconfig.json`
  - `hardhat.config.js`
  - `scripts/deploy.js`
  - `src/contracts/deployedAddresses.json`
  - `src/contracts/index.ts`
  - `src/lib/storage.ts`
  - `src/lib/contracts.ts`
  - `contracts/CredentialRegistry.sol`
  - `contracts/IdentityRegistry.sol`
  - `.env.local`
  - `.env.example`
  - `.gitignore`
  - `.dockerignore`
  - `docker-compose.yml`
  - `docs/DEPLOYMENT.md`
  - `package.json`

### 2.2 Preserved Baseline Invariants
- **Prompt 45 Backup Preserved:** `backups/backup_prompt45_20261102_000123/` remains untouched.
- **SQLite Database Integrity:** `PRAGMA integrity_check` returned `ok`.
- **Database Batches:** 2
  - Batch 1: `MGM-2024-BTECH-BATCH01` (Merkle Root: `0x73c9d682d5dadeba35e6ad3bf62be75c3e3161bf0136fb5b9043f0f4d656a717`, Status: `INSTITUTIONAL_STORED`, 4 credentials)
  - Batch 2: `DEMO_GRADUATION_2024_1` (Merkle Root: `0xf0694dc9f2365b41463b40715cdf291af859d5c316b303d5c4f2b9bb58951040`, Status: `PENDING_ANCHOR`, 1 credential)
- **Total Credentials:** 5.

---

## 3. TypeScript Configuration Investigation (`tsconfig.json`)

### 3.1 Background of the Prompt 45 TypeScript Failure
During Prompt 45, running `npx tsc --noEmit` initially produced two module resolution errors:
```
backups/backup_prompt45_20261102_000123/index.ts(2,33): error TS2307: Cannot find module './abis/IdentityRegistry.json'
backups/backup_prompt45_20261102_000123/storage.ts(1,116): error TS2307: Cannot find module '../types'
```

### 3.2 Investigation Findings & Root Cause Analysis
1. **Property Diff Analysis:**
   ```diff
   --- a/tsconfig.json
   +++ b/tsconfig.json
   @@ -25,2 +25,2 @@
   -  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
   -  "exclude": ["node_modules"]
   +  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next_prod/types/**/*.ts"],
   +  "exclude": ["node_modules", "backups"]
   ```
2. **Root Cause:**
   - The workspace root `tsconfig.json` defines `"include": ["**/*.ts", "**/*.tsx"]`. This recursive wildcard instructed TypeScript to compile every `.ts` file anywhere in the workspace directory tree.
   - When timestamped safety backups were created in `backups/backup_prompt45_...`, individual source files like `src/contracts/index.ts` and `src/lib/storage.ts` were copied into `backups/` as standalone files.
   - Because `index.ts` has a relative import `import IdentityRegistryAbi from "./abis/IdentityRegistry.json"` and `storage.ts` has `import { BatchRecord } from "../types"`, placing those files into `backups/` broke their relative paths because the `./abis` and `../types` folders do not exist inside `backups/`.
3. **Application Source File Coverage Verification:**
   - We verified via `npx tsc --listFiles` that **every single application source file** under `src/` continues to be analyzed:
     - 46 application source files compiled (all types, all API routes, all UI components, all crypto/auth libraries, and all pages).
     - Both modified files ([`src/contracts/index.ts`](file:///c:/Final-Year-Project-Blockchain/src/contracts/index.ts) and [`src/lib/storage.ts`](file:///c:/Final-Year-Project-Blockchain/src/lib/storage.ts)) are actively compiled.
4. **No Error Suppression:**
   - No application directories were excluded.
   - No `@ts-nocheck` directives were added.
   - `skipLibCheck` was not modified (it was already standard Next.js default).
   - `npx tsc --noEmit` exits with status `0` and **zero errors**.
5. **Conclusion:**
   - The original failure was an artifact of TypeScript scanning flat backup files outside `src/`. Adding `"backups"` to `"exclude"` is standard engineering practice and did not hide any genuine application errors.

---

## 4. Environment File Security Audit

### 4.1 Git and Docker Context Exclusion
- **`.gitignore`:** Line 37 contains `.env` and Line 38 contains `.env*` (which matches `.env.local`). `git check-ignore -v .env.local` confirmed `.env.local` is completely ignored by Git. Only `.env.example` is tracked.
- **`.dockerignore`:** Explicitly excludes `.env`, `.env.local`, `.git`, `backups`, and `data`. Secrets cannot leak into Docker build contexts or images.

### 4.2 Security Inspection of All Environment Variables
| Environment File | Variable Name | Value Status | Security Classification |
| :--- | :--- | :--- | :--- |
| `.env.local` | `NEXT_PUBLIC_SEPOLIA_RPC` | `PRESENT` (Public URL) | Public Network Endpoint |
| `.env.local` | `NEXT_PUBLIC_CHAIN_ID` | `PRESENT` (`11155111`) | Public Network Chain ID |
| `.env.local` | `NEXT_PUBLIC_CREDENTIAL_REGISTRY` | `PRESENT` (`0x8920...`) | Fallback Contract Address |
| `.env.local` | `NEXT_PUBLIC_IDENTITY_REGISTRY` | `PRESENT` (`0xe7f1...`) | Fallback Contract Address |
| `.env.local` | `AUTH_SECRET` | `PRESENT` | Server Secret (JWT signing) |
| `.env.local` | `ADMIN_PASSWORD` | `PRESENT` | Server Secret (Admin password) |
| `.env.local` | `STUDENT_DEFAULT_PASSWORD` | `PRESENT` | Server Secret (Student password) |
| `.env.local` | `PRIVATE_KEY` | `MISSING` | Critical Secret (Deployer wallet) |
| `.env.example` | `AUTH_SECRET` | `PLACEHOLDER` (Empty) | Template |
| `.env.example` | `ADMIN_PASSWORD` | `PLACEHOLDER` (Empty) | Template |
| `.env.example` | `STUDENT_DEFAULT_PASSWORD` | `PLACEHOLDER` (Empty) | Template |
| `.env.example` | `PRIVATE_KEY` | `PLACEHOLDER` (Commented) | Template |
| `.env.example` | `PINATA_JWT` / `PINATA_API_KEY` | `PLACEHOLDER` (Empty) | Template |

### 4.3 Private Key Exposure Audit
- An automated regex scan (`scratch/scan_secrets.js`) searched all source code, documentation, scripts, JSON artifacts, and logs for 64-character hexadecimal private keys (`0x[0-9a-fA-F]{64}`).
- **Result:** **ZERO private keys found.** No private key was generated, replaced, copied, or logged.

---

## 5. Frontend Contract Address Resolution Audit

### 5.1 Hardhat Test Account 2 Placeholder Remediation
- **Identified Legacy Issue:** The address `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` is Hardhat Test Account #2. When configured as an identity registry, MetaMask rejected transactions with internal account errors.
- **Remediation Implemented:**
  1. [`src/contracts/index.ts`](file:///c:/Final-Year-Project-Blockchain/src/contracts/index.ts): Added explicit filter `HARDHAT_PLACEHOLDER_ACCOUNT_2`. If `NEXT_PUBLIC_IDENTITY_REGISTRY` in the environment equals `0x3c44...`, it is discarded and safely falls back to `deployedAddresses.identityRegistry` (`0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`).
  2. [`src/lib/storage.ts`](file:///c:/Final-Year-Project-Blockchain/src/lib/storage.ts): Updated `DEFAULT_SEPOLIA_CONFIG` to discard `0x3c44...`. In browser environments, `getSepoliaConfig()` auto-migrates any stale `localStorage` entry away from `0x3c44...`.
  3. Decoupled `.env.example`, `docker-compose.yml`, and `docs/DEPLOYMENT.md` so that `0xe7f1...` is the documented default rather than `0x3C44...`.

### 5.2 Protection Against Stale Pre-Deployment Fallbacks
- In `src/contracts/index.ts`:
  - When `scripts/deploy.js` deploys genuine contracts in Prompt 46, `deployedAddresses.json` is updated with `deployer: wallet.address` and `txHashes`.
  - If a user has `.env.local` containing the legacy fallback address `0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7`, the code prioritizes the genuine live deployed address from `deployedAddresses.json`.
- In `src/lib/contracts.ts`:
  - Both `verifyCredentialOnChain()` and `verifyBatchAnchorEvidence()` query `provider.getCode(targetAddress)`. If the contract bytecode is empty (`0x`), the application refuses on-chain verification and transparently informs the user. **A missing or placeholder contract address can never produce a false "verified on-chain" status.**

---

## 6. Deployment Cost and Gas Estimation Review

### 6.1 Gas Estimation Methodology & Receipts
- **Source of Gas Figures:** Exact Hardhat EVM local deployment transaction receipts:
  - `IdentityRegistry`: 1,019,361 gasUsed
  - `CredentialRegistry`: 1,497,823 gasUsed
  - Combined Base Gas: **2,517,184 gas**
- **20% Buffer Calculation:**
  $$\text{Buffered Gas} = 2,517,184 \times 1.20 = 3,020,620.8 \rightarrow 3,020,620 \text{ gas units}$$

### 6.2 Anomaly Analysis: 17 Wei RPC Gas Price
- Live read-only RPC calls to `https://ethereum-sepolia-rpc.publicnode.com` returned `gasPrice: 17 Wei`.
- **Technical Explanation:** On Ethereum Sepolia, when network activity in a block is near zero, the EIP-1559 `baseFee` drops to negligible single-digit or double-digit Wei amounts.
- **Mempool Reality:** Submitting a transaction with only 17 Wei total fee without a priority fee (miner tip) will cause the transaction to stall indefinitely. Standard Web3 wallets (MetaMask, Ethers) automatically append a minimum priority fee of 1.0 to 2.5 Gwei (1,000,000,000 to 2,500,000,000 Wei).
- Therefore, the 17 Wei figure represents an idle testnet base fee lower bound, not a realistic deployment cost.

### 6.3 Comprehensive Cost Scenarios
Using the required formula:
$$\text{Estimated cost in ETH} = \frac{\text{Gas units} \times \text{Gas price in Gwei}}{1,000,000,000}$$

| Scenario | Gas Price | Base Gas Cost (2,517,184 gas) | +20% Buffer Cost (3,020,620 gas) | Feasibility Assessment |
| :--- | :---: | :---: | :---: | :--- |
| **Current RPC Idle Base** | 0.000000017 Gwei (17 Wei) | 0.000000000043 ETH | 0.000000000051 ETH | Theoretical minimum (will stall without priority fee) |
| **Standard Sepolia Fee** | 10 Gwei | 0.025172 Sepolia ETH | 0.030206 Sepolia ETH | Typical normal testnet conditions |
| **High Congestion Fee** | 25 Gwei | 0.062930 Sepolia ETH | 0.075515 Sepolia ETH | Recommended safe execution threshold |
| **Extreme Congestion Peak** | 35 Gwei | 0.088101 Sepolia ETH | 0.105722 Sepolia ETH | Ultra-congested testnet buffer |

> [!TIP]
> **Recommended Wallet Balance:** The deployer account should hold between **0.05 and 0.10 Sepolia ETH** to ensure immediate transaction inclusion.

---

## 7. Deployer vs. Institutional Authority Wallet Plan

### 7.1 Contract Access Control Mechanics
1. **Ownership Assignment:** Both `IdentityRegistry.sol` and `CredentialRegistry.sol` assign `owner = msg.sender` in their constructors.
2. **Authority Issuer Assignment (`CredentialRegistry.sol`):**
   ```solidity
   constructor() {
       owner = msg.sender;
       authorizedIssuers[msg.sender] = true;
       institutionNames[msg.sender] = "MGM University, Chhatrapati Sambhajinagar";
   }
   ```
   The deployer wallet (`msg.sender`) is immediately authorized as an issuer.
3. **Institutional Authority Wallet:** `0x71c56538b15294500b73F8472B4fe963D4e58Bef` (MGM University Authority).

### 7.2 Two Operational Scenarios
- **Scenario A: Deployer = Institutional Authority (`0x71c56538...`)**
  - The authority wallet deploys both contracts.
  - It becomes the owner and authorized issuer on-chain automatically.
  - Zero additional transactions required.
- **Scenario B: Deployer $\neq$ Institutional Authority (e.g. Developer Testnet Faucet Wallet)**
  - The developer deploys from their personal faucet wallet `0xDeployer...`.
  - In order for `0x71c56538...` to anchor batches, the deployer must call:
    ```solidity
    registerInstitution(0x71c56538b15294500b73F8472B4fe963D4e58Bef, "MGM University, Chhatrapati Sambhajinagar")
    ```
  - **Measured Gas for `registerInstitution()`:** 118,238 gas (measured from EVM receipt).
  - **Additional Cost at 25 Gwei:** $118,238 \times 25 / 10^9 = 0.002956\text{ Sepolia ETH}$ (~0.003 ETH).
  - Combined deployment + registration gas: $2,517,184 + 118,238 = 2,635,422\text{ gas}$ (with 20% buffer: **3,162,506 gas**).

---

## 8. Deployment Script Safety Audit (`scripts/deploy.js`)

[`scripts/deploy.js`](file:///c:/Final-Year-Project-Blockchain/scripts/deploy.js) was audited and hardened with the following safety controls:

1. **Dry-Run Enforcement:**
   - Defaults to dry run if `--confirm-live-deployment` is omitted.
   - Refuses to call `factory.deploy()`, broadcast transactions, or sign requests.
2. **Strict Chain ID Guard:**
   - Validates that connected network is Sepolia (`11155111`). Rejects mainnet or other chains.
3. **Zero Balance Interception:**
   - Checks deployer balance before attempting deployment; halts with clear faucet guidance if balance is 0.
4. **On-Chain Receipt Status Check:**
   - Asserts `identityReceipt.status === 1` and `credentialReceipt.status === 1`. Throws immediately if any transaction reverts on-chain.
5. **Partial Deployment Recovery State:**
   - If `IdentityRegistry` succeeds but `CredentialRegistry` fails (e.g. out-of-gas or network drop), the script writes `src/contracts/partialDeployment.json` recording the mined address, tx hash, and block number.
   - This prevents orphaned contracts and ensures `deployedAddresses.json` is not updated with half-broken data.
   - The intermediate file is cleaned up automatically upon complete dual-contract deployment.
6. **Deployer vs. Authority Visibility:**
   - Displays clear console indicators informing the operator whether the deployer matches the institutional authority or whether `registerInstitution()` will be required.

---

## 9. Comprehensive Regression Test Results

All regression suites were executed locally with zero failures:

| Test Suite | Scope | Checks Passed | Result |
| :--- | :--- | :---: | :---: |
| **TypeScript Type Check** | `npx tsc --noEmit` across all 46 `src/` files | Full source tree | `PASS` (0 errors) |
| **Next.js Production Build** | `npm run build` (10 static & dynamic routes) | All pages & APIs | `PASS` (Build code 0) |
| **Prompt 44 Contract Audit** | `scratch/test_prompt44_contract_audit.js` | 20 / 20 checks | `PASS` |
| **Prompt 44 In-Memory EVM** | `scratch/test_prompt44_evm_execution.js` | 13 / 13 checks | `PASS` |
| **Prompt 45 Preflight Audit** | `scratch/test_prompt45_preflight_audit.js` | 30 / 30 checks | `PASS` |
| **Dry-Run Safety Simulation** | `scratch/test_prompt45_dryrun_simulation.js` | 6 / 6 checks | `PASS` |
| **Secret Exposure Scanner** | `scratch/scan_secrets.js` (Regex scan) | All files & docs | `PASS` (0 secrets) |
| **Database Integrity & Roots** | `data/veritrust.db` integrity & Merkle baseline | Invariant | `PASS` |

---

## 10. Remaining Deployment Blockers

Before Prompt 46 (Actual Sepolia Deployment) can be executed, the user must resolve:

1. **Deployer Private Key (`PRIVATE_KEY`):**  
   Add the deployer wallet private key to the local `.env` file:
   ```env
   PRIVATE_KEY=your_private_key_here
   SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
   ```
2. **Deployer Wallet Testnet Funding:**  
   Ensure the deploying wallet has at least **0.05 to 0.10 Sepolia ETH** (via Google Cloud Web3 Faucet, Infura, or Chainlink).
3. **Explicit User Approval:**  
   Review the deployer public address and approve execution of live deployment.

---

## 11. Final Recommendation

All code, configurations, type definitions, and deployment scripts are in a fully verified, production-hardened state. **No further code changes are required.**

The project is ready to transition to **Prompt 46 — Actual Ethereum Sepolia Smart Contract Deployment** as soon as the user provides the funded wallet and issues written authorization.

