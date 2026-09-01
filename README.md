# Blockchain-Based Academic Degree Verification & Credential Authentication System

[![Sepolia Testnet](https://img.shields.io/badge/Blockchain-Ethereum_Sepolia-blue)](https://sepolia.etherscan.io/)
[![Standard](https://img.shields.io/badge/Standard-OpenCerts_2.0_%2F_W3C_VC-green)](https://www.w3.org/TR/vc-data-model/)
[![DPDP Act](https://img.shields.io/badge/Compliance-India_DPDP_Act_(Zero--PII)-purple)](#)
[![NEP 2020](https://img.shields.io/badge/Education_Policy-NEP_2020_ABC_Framework-orange)](#)

A production-ready, minimalist, and cryptographically secure Web3 system for issuing, verifying, and dynamically revoking academic degree credentials with zero-PII on-chain, EIP-712 identity binding, and dual-role university desk automation.

---

## 🌟 System Highlights & Key Innovations

1. **OpenCerts / Blockcerts Minimalist UI**:
   - Zero-login, zero-gas client-side cryptographic verification in `<300ms`.
   - Live camera QR code scanning and instant JSON drag-and-drop validation.
   - Interactive Canvas Confetti, glowing tamper-proof badges, and official academic degree cards with printable/PDF export.

2. **India DPDP Act (Digital Personal Data Protection Act) Compliance**:
   - **Zero-PII On-Chain**: No student names, PRNs, or transcripts are stored on Ethereum. Only 32-byte cryptographic Merkle roots are committed.
   - **Zero-Knowledge Selective Disclosure**: Students can generate verifiable range proofs (e.g., `CGPA >= 7.5`) and redact sensitive identifiers (PRN/Aadhaar) when presenting credentials to recruiters.

3. **EIP-712 PRN-to-Wallet Identity Binding**:
   - Cryptographically binds student Permanent Registration Numbers (PRNs) to their MetaMask wallet addresses via `eth_signTypedData_v4` and `IdentityRegistry.sol`.

4. **$O(1)$ Dynamic Bitmap Revocation**:
   - `CredentialRegistry.sol` implements a 256-bit dynamic revocation bitmap. Invalidate specific student degrees instantaneously without modifying or recomputing the Merkle root.

5. **NEP 2020 Academic Bank of Credits (ABC) & NHEQF Framework**:
   - Ingests modular course credits across multiple institutions (SWAYAM, IITs, State Universities).
   - Automatically aggregates NHEQF credit units and calculates lateral entry eligibility (e.g. 80+ credits for Semester V direct admission).

6. **Placement Cell (T&P) Batch Resume CGPA Audit**:
   - Bulk-audits 500+ student resume CGPAs against on-chain records and flags inflated metrics instantly with discrepancy delta reports.

---

## 📁 Repository Structure

```
├── contracts/
│   ├── IdentityRegistry.sol           # EIP-712 PRN-to-wallet identity binding
│   └── CredentialRegistry.sol         # O(1) Merkle root anchor & 256-bit dynamic revocation bitmap
├── public/
│   └── fixtures/
│       ├── valid_degree_sample.json   # Pre-calculated valid Merkle proof certificate
│       ├── tampered_degree_sample.json# Modified CGPA to demonstrate instant tamper detection
│       ├── sample_batch.csv           # Graduation batch CSV for Exam Cell
│       ├── sample_course_credits.json # Multi-institution NEP 2020 course credits
│       └── sample_resumes_audit.csv   # T&P Placement Cell audit sample
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout with responsive Navbar
│   │   ├── page.tsx                   # View 1: Public Drag-and-Drop Verifier (OpenCerts style)
│   │   ├── student/page.tsx           # View 2: Student Portal & EIP-712 Vault
│   │   ├── issuer/page.tsx            # View 3: Exam Cell Batch Minting & Merkle Tree Visualizer
│   │   └── university-verifier/page.tsx # View 4: Institutional Desk (Admissions, ABC, T&P)
│   ├── components/
│   │   ├── Navbar.tsx                 # Top navigation with network & wallet states
│   │   ├── DropzoneVerifier.tsx       # Drag-and-drop & live QR scanner engine
│   │   ├── DegreeCertificate.tsx      # OpenCerts official degree card renderer
│   │   ├── MerkleTreeVisualizer.tsx   # Interactive visual Merkle node hierarchy
│   │   ├── ZkProofModal.tsx           # DPDP selective disclosure generator
│   │   ├── BatchRevocationModal.tsx   # Dynamic bitmap revocation modal
│   │   └── QrScannerModal.tsx         # Live camera QR scanner
│   ├── lib/
│   │   ├── crypto.ts                  # Keccak256 canonical hashing & MerkleTree engine
│   │   ├── eip712.ts                  # EIP-712 typed signing & verification
│   │   ├── zkProof.ts                 # Zero-Knowledge selective disclosure assertions
│   │   ├── nep2020.ts                 # NHEQF levels & Academic Bank of Credits calculator
│   │   ├── contracts.ts               # ethers.js Sepolia provider & fallback engine
│   │   ├── storage.ts                 # LocalStorage persistence & ERP sample data
│   │   └── zipHelper.ts               # JSZip bulk student certificate packager
│   └── types/
│       └── index.ts                   # W3C, Merkle, and NEP-2020 TypeScript interfaces
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js `v18+` or `v20+`
- MetaMask browser extension (optional; app includes instant demo signer mode)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build for Production
```bash
npm run build
npm start
```

---

## 🧪 Testing the 4 Operational Views

### View 1: Public Drag-and-Drop Verifier (`/`)
- Click **"Valid Degree Sample"** -> Observe confetti animation, glowing green badge (`100% Authentic & Tamper-Proof`), official degree card, and Sepolia transaction link.
- Click **"Tampered Degree Sample"** -> Observe instant red warning (`Cryptographic Hash Mismatch / Data Tampered`).

### View 2: Student Portal (`/student`)
- Enter PRN `PRN20200101` and click **"Bind MetaMask Wallet"** to trigger EIP-712 typed signature.
- Click **"Download W3C JSON-LD"** to download the offline certificate.
- Click **"Generate ZK Attribute Proof"** -> Set threshold `CGPA >= 7.5` and enable DPDP PII Redaction -> Download selective disclosure JSON.

### View 3: Exam Cell Batch Minting (`/issuer`)
- Click **"Load Sample Batch CSV"** -> View real-time calculated 32-byte Merkle Root and interactive node tree visualizer.
- Click **"Anchor Batch to Sepolia"** to anchor on-chain.
- Click **"Download All Student JSON Files (.zip)"** to package individual student credentials.
- Click **"Manage Revocations"** to revoke any student credential via the 256-bit bitmap.

### View 4: Institutional Desk (`/university-verifier`)
- **Admissions Tab**: Verify candidate credentials in `<300ms`.
- **NEP 2020 ABC Tab**: View multi-institution course ledger, NHEQF Level calculations, and Semester V lateral entry eligibility.
- **Placement T&P Tab**: Click **"Load Sample T&P Audit CSV"** to batch-audit candidate resumes against on-chain records.

---

## 📜 Smart Contracts

- **`IdentityRegistry.sol`**:
  - `bindIdentity(string prn, uint256 timestamp, bytes signature)`
  - `getBoundWallet(string prn)`
- **`CredentialRegistry.sol`**:
  - `anchorMerkleRoot(string batchId, bytes32 merkleRoot, string ipfsCid)`
  - `revokeCredential(string batchId, uint256 leafIndex)`
  - `verifyCredential(string batchId, bytes32 leaf, bytes32[] proof, uint256 leafIndex)`

---

## 📄 License
MIT License.
