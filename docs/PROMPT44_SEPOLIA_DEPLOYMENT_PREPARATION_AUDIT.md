# SOET VeriTrust — Sepolia Smart Contract Deployment Preparation & Security Audit
**Prompt 44 Comprehensive Pre-Deployment Audit Report**

- **Project:** SOET VeriTrust – Blockchain-Based Academic Degree Verification & AI Forensics
- **Repository:** `c:\Final-Year-Project-Blockchain\`
- **Date:** November 1, 2026
- **Auditor:** Antigravity AI Smart Contracts & Security Agent
- **Target Network:** Ethereum Sepolia Testnet (Chain ID: `11155111`)
- **Status:** Pre-Deployment Audit Complete | **PREPARATION-ONLY (ZERO ETH SPENT, NO TRANSACTIONS SUBMITTED)**

---

## 1. Backup Location

In accordance with strict safety directives, a complete timestamped backup of contract sources, deployment scripts, configurations, and address mappings was taken before any modifications:

- **Backup Directory:** `backups/backup_prompt44_20261101_235100/`
- **Files Preserved:**
  - `CredentialRegistry.sol.bak` (Source: `contracts/CredentialRegistry.sol`)
  - `IdentityRegistry.sol.bak` (Source: `contracts/IdentityRegistry.sol`)
  - `deploy.js.bak` (Source: `scripts/deploy.js`)
  - `hardhat.config.js.bak` (Source: `hardhat.config.js`)
  - `deployedAddresses.json.bak` (Source: `src/contracts/deployedAddresses.json`)
  - `index.ts.bak` (Source: `src/contracts/index.ts`)
  - `.env.example.bak` (Source: `.env.example`)

---

## 2. Files Inspected

The following 10 contract and configuration files were audited:
1. `contracts/CredentialRegistry.sol` (Merkle root anchor, O(1) bitmap revocation, consortium registry)
2. `contracts/IdentityRegistry.sol` (EIP-712 ECDSA signature binding, zero-PII commitment hashes)
3. `scripts/deploy.js` (Deployment script, ethers v6 factory, ABI export, address storage)
4. `hardhat.config.js` (Compiler version, network definitions, optimizer settings)
5. `src/contracts/deployedAddresses.json` (Active application address mappings)
6. `src/contracts/index.ts` (Application contract configuration and ABI imports)
7. `src/lib/contracts.ts` (Server and client contract interaction helpers, RPC providers)
8. `src/lib/storage.ts` (Default Sepolia configuration and initial demo batches)
9. `.env.example` (Environment variable template and address placeholders)
10. `package.json` (Hardhat v2.22.0, Ethers v6.13.5 dependencies)

---

## 3. Files Modified

1. **[`scripts/deploy.js`](file:///c:/Final-Year-Project-Blockchain/scripts/deploy.js):**
   - **Enforced Strict Sepolia Network Guard:** Added verification ensuring `Number(network.chainId) === 11155111`. Refuses deployment on any other network.
   - **Dry-Run Safety Switch:** Added requirement for `--confirm-live-deployment`. Running `node scripts/deploy.js` defaults to a non-destructive pre-flight balance and configuration check.
   - **Block Number Recording:** Enhanced deployment receipt handling to record block numbers (`blockNumbers.identityRegistry`, `blockNumbers.credentialRegistry`) alongside transaction hashes.
   - **Historical Deployment Log:** Before writing `deployedAddresses.json`, automatically creates `deployedAddresses.backup.json` and appends full deployment records to `src/contracts/deploymentHistory.json`.
   - **Consistent RPC Environment Resolution:** Checks `SEPOLIA_RPC_URL`, `NEXT_PUBLIC_SEPOLIA_RPC`, and `NEXT_PUBLIC_SEPOLIA_RPC_URL` before falling back to publicnode.com.
2. **[`src/contracts/index.ts`](file:///c:/Final-Year-Project-Blockchain/src/contracts/index.ts):**
   - **Environment Variable Overrides:** Updated `contractConfig` to allow `process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY` and `process.env.NEXT_PUBLIC_IDENTITY_REGISTRY` to override `deployedAddresses.json` without requiring file rebuilds.

---

## 4. Solidity Source Audit Findings

### `contracts/CredentialRegistry.sol`:
- **Compiler Compatibility:** `pragma solidity ^0.8.20;` (`VERIFIED`). Matches Hardhat optimizer configuration (`runs: 200`).
- **Constructor:** `constructor()` takes **0 parameters** (`VERIFIED`).
  - Sets `owner = msg.sender`.
  - Sets `authorizedIssuers[msg.sender] = true`.
  - Sets default institution name: `institutionNames[msg.sender] = "MGM University, Chhatrapati Sambhajinagar"`.
- **Cross-Contract Dependencies:** Zero imports or dependencies on `IdentityRegistry.sol` (`VERIFIED`).
- **Access Control:**
  - `onlyOwner`: Restricts `registerInstitution`, `setIssuerAuthorization`, `transferOwnership`.
  - `onlyIssuer`: Restricts `anchorMerkleRoot`, `revokeCredential`. Owner is an authorized issuer by default.
- **Merkle Storage:** 32-byte `bytes32` roots indexed by `keccak256(bytes(batchId))`. Prevents duplicate anchoring of same batch ID.
- **Bitmap Revocation:** Uses an O(1) 256-bit bitmap mapping (`wordIndex = leafIndex / 256`, `bitIndex = leafIndex % 256`, `mask = 1 << bitIndex`). Revocation modifies only the bit flag without invalidating the Merkle root.
- **Events Emitted:** `BatchAnchored`, `CredentialRevoked`, `InstitutionRegistered`, `IssuerStatusUpdated`, `OwnershipTransferred` (`VERIFIED`).

### `contracts/IdentityRegistry.sol`:
- **Compiler Compatibility:** `pragma solidity ^0.8.20;` (`VERIFIED`).
- **Constructor:** `constructor()` takes **0 parameters** (`VERIFIED`).
  - Sets `owner = msg.sender`.
  - Computes immutable `DOMAIN_SEPARATOR` using `block.chainid` and `address(this)`.
- **EIP-712 Signature Verification:**
  - Standard Binding: `IdentityBinding(string prn,address wallet,uint256 timestamp)`.
  - Zero-PII Binding: `IdentityHashBinding(bytes32 prnHash,address wallet,uint256 timestamp)`.
  - Verifies `recoverSigner(digest, signature) == msg.sender`.
- **Zero-PII DPDP Compliance:** Allows binding via 32-byte Keccak-256 PRN hash commitments without storing plaintext student PRNs on-chain (`VERIFIED`).

---

## 5. Constructor Parameter Details

| Contract | Constructor Arguments | Initialization Required at Deployment |
| :--- | :--- | :--- |
| **`IdentityRegistry`** | **None (`0` parameters)** | None. Initializes `owner` and immutable `DOMAIN_SEPARATOR` automatically. |
| **`CredentialRegistry`** | **None (`0` parameters)** | None. Automatically initializes `owner`, authorizes deployer as issuer, and sets MGM University institution name. |

---

## 6. Contract Deployment Sequence

Because neither contract imports or requires the address of the other contract during construction, deployment order is **operationally independent**. The recommended sequence for clean logging is:

1. **Step 1: Deploy `IdentityRegistry.sol`**
   - Transacts: `new IdentityRegistry()`
   - Captures: `identityAddress`, `txHash`, `blockNumber`.
2. **Step 2: Deploy `CredentialRegistry.sol`**
   - Transacts: `new CredentialRegistry()`
   - Captures: `credentialAddress`, `txHash`, `blockNumber`.
3. **Step 3 (Post-Deployment Configuration):**
   - If the university authority wallet (`0x71c56538b15294500b73F8472B4fe963D4e58Bef`) is distinct from the deployer account:
     - Deployer calls `credentialRegistry.registerInstitution(authorityWallet, "MGM University, Chhatrapati Sambhajinagar")`.
   - If deployer account is the authority wallet, zero post-deployment transactions are required.
4. **Step 4 (Automated Artifact Export):**
   - Script exports ABIs to `src/contracts/abis/` and updates `src/contracts/deployedAddresses.json` and `src/contracts/deploymentHistory.json`.

---

## 7. Hardhat Configuration Findings

- **Config File:** `hardhat.config.js` (`VERIFIED`).
- **Compiler:** `solidity: { version: "0.8.20", settings: { optimizer: { enabled: true, runs: 200 } } }` (`VERIFIED`).
- **Sepolia Network:**
  - `chainId: 11155111` (`VERIFIED`).
  - `url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"` (`VERIFIED`).
  - `accounts`: Safely derived from `process.env.PRIVATE_KEY` with `0x` formatting. If unset, defaults to empty array `[]` (`VERIFIED`).
- **Etherscan Verification:** Configured for `process.env.ETHERSCAN_API_KEY` (`VERIFIED`).

---

## 8. Environment Variable Requirements

| Variable | Target Value / Purpose | Required for Deployment? | Status |
| :--- | :--- | :--- | :--- |
| `SEPOLIA_RPC_URL` / `NEXT_PUBLIC_SEPOLIA_RPC` | Sepolia JSON-RPC provider URL | **YES** | Configured with publicnode.com fallback |
| `PRIVATE_KEY` | Hex-encoded deployer private key with testnet ETH | **YES (Live Deployment)** | **Unset (PREPARATION ONLY)** |
| `ETHERSCAN_API_KEY` | Etherscan API key for contract source code verification | Optional | Optional |
| `NEXT_PUBLIC_CHAIN_ID` | `11155111` | **YES** | Configured in `.env.example` |

---

## 9. Existing Contract Address Verification

The repository historically contained the following addresses:

| Registry Reference | Address | Source |
| :--- | :--- | :--- |
| `CredentialRegistry` | `0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7` | `.env.example`, `deployedAddresses.json` |
| `IdentityRegistry` | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` | `deployedAddresses.json` (Hardhat Account #2 default) |
| `IdentityRegistry (Alt)` | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `.env.example` |

---

## 10. Bytecode Verification Results (Live Sepolia RPC)

Using read-only RPC queries against `https://ethereum-sepolia-rpc.publicnode.com` (Chain ID `11155111` confirmed):

| Address | Code Length | Deployed Bytecode? | Audit Finding |
| :--- | :--- | :--- | :--- |
| `0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7` | 2 bytes (`0x`) | **NO (`false`)** | **CONFIRMED UNDEPLOYED:** EOA or undeployed placeholder. |
| `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` | 2 bytes (`0x`) | **NO (`false`)** | **CONFIRMED UNDEPLOYED:** Local Hardhat test address. |
| `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | 48 bytes | **Partial/Unrelated** | EIP-7702 delegation designation or ERC-4337 stub; not IdentityRegistry. |

**Audit Conclusion:** Genuine deployment to Sepolia has **not** occurred. The application's fallback safeguards (implemented in Prompts 35–37) correctly prevent these addresses from claiming Sepolia verification.

---

## 11. Frontend and Backend Address Dependencies

1. **`src/contracts/index.ts`:**
   - Now reads:
     ```typescript
     credentialRegistryAddress: process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY || deployedAddresses.credentialRegistry,
     identityRegistryAddress: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY || deployedAddresses.identityRegistry,
     ```
2. **`src/lib/storage.ts`:**
   - `DEFAULT_SEPOLIA_CONFIG` checks `process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY` and `process.env.NEXT_PUBLIC_IDENTITY_REGISTRY`.
3. **`src/lib/contracts.ts`:**
   - Server-side verification functions accept explicit contract address arguments with fallback to `contractConfig`.
4. **ABI Files:**
   - `src/contracts/abis/CredentialRegistry.json` and `IdentityRegistry.json` are fully up-to-date with Hardhat compilation artifacts.

---

## 12. Local Compilation & Test Results

### 1. Hardhat Compilation (`npx hardhat compile --force`):
- **Result:** **PASS** (Compiled 2 Solidity files successfully to EVM target: Paris).

### 2. Static & RPC Audit Suite (`scratch/test_prompt44_contract_audit.js`):
- **Result:** **20 / 20 PASSED** (Bytecode verification, constructor params, script safety, Sepolia RPC connectivity, database invariance).

### 3. In-Memory EVM Execution Suite (`scratch/test_prompt44_evm_execution.js`):
- **Result:** **13 / 13 PASSED** (Local Hardhat EVM transactions):
  - IdentityRegistry deployment (0 args): **PASS**
  - CredentialRegistry deployment (0 args): **PASS**
  - Owner & authorized issuer initialization: **PASS**
  - `anchorMerkleRoot` & `BatchAnchored` event: **PASS**
  - `verifyCredential` on-chain verification: **PASS**
  - O(1) bitmap `revokeCredential`: **PASS**
  - Consortium `registerInstitution`: **PASS**
  - EIP-712 `bindIdentity` ECDSA recovery: **PASS**
  - EIP-712 `bindIdentityZeroPii` commitment hash: **PASS**

---

## 13. Security Concerns

1. **Private Key Handling:**
   - `scripts/deploy.js` strictly reads `PRIVATE_KEY` from environment variables and never logs it.
   - Deployers must never commit `.env` or paste private keys in public repositories.
2. **Sepolia Gas Faucet Funding:**
   - The deployer wallet must possess at least **0.05 Sepolia testnet ETH** to deploy both contracts. Faucets: `sepoliafaucet.com`, `infura.io/faucet/sepolia`.
3. **Multi-University Authority Separation:**
   - If the examination authority wallet is different from the deployer wallet, `registerInstitution` must be called post-deployment to authorize the authority wallet.

---

## 14. Remaining Deployment Blockers

- **Deployer Wallet Private Key:** A funded Ethereum Sepolia wallet private key must be supplied via `PRIVATE_KEY` environment variable prior to running Prompt 45.
- **Gas Balance:** Deployer wallet must have testnet Sepolia ETH.
- **Explicit User Approval:** In accordance with safety rules, no live deployment can be executed without explicit user instruction.

---

## 15. Exact Deployment Steps for Prompt 45 (Live Deployment)

When live deployment is approved by the user:

```bash
# 1. Fund deployer wallet with Sepolia ETH (minimum 0.05 ETH)

# 2. Configure environment variable in .env (DO NOT COMMIT):
# PRIVATE_KEY=0x<your_sepolia_private_key>
# SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

# 3. Perform pre-flight dry-run check (verifies balance, chainId, network):
node scripts/deploy.js

# 4. Execute live on-chain deployment with explicit confirmation:
node scripts/deploy.js --confirm-live-deployment

# 5. Verify contract addresses in src/contracts/deployedAddresses.json

# 6. Update .env with new contract addresses:
# NEXT_PUBLIC_CREDENTIAL_REGISTRY=<new_credential_registry_address>
# NEXT_PUBLIC_IDENTITY_REGISTRY=<new_identity_registry_address>

# 7. (Optional) Verify contract source code on Etherscan:
# npx hardhat verify --network sepolia <new_credential_registry_address>
# npx hardhat verify --network sepolia <new_identity_registry_address>
```

---

### Database Integrity Verification (Bit-for-Bit Comparison)

- **Database Path:** `data/veritrust.db`
- **Integrity Check:** `ok`
- **Total Batches:** `2`
  - `MGM-2024-BTECH-BATCH01`: Root `0x73c9d682d5dadeba35e6ad3bf62be75c3e3161bf0136fb5b9043f0f4d656a717` (Status: `INSTITUTIONAL_STORED`, Tx: `null`)
  - `DEMO_GRADUATION_2024_1`: Root `0xf0694dc9f2365b41463b40715cdf291af859d5c316b303d5c4f2b9bb58951040` (Status: `PENDING_ANCHOR`, Tx: `null`)
- **Total Credentials:** `5` (All student records, PRNs, and leaf indices intact).

