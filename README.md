# Blockchain-Based Academic Degree Verification & Credential Authentication System

[![Sepolia Testnet](https://img.shields.io/badge/Blockchain-Ethereum_Sepolia-blue)](https://sepolia.etherscan.io/)
[![Standard](https://img.shields.io/badge/Standard-OpenCerts_2.0_%2F_W3C_VC-green)](https://www.w3.org/TR/vc-data-model/)
[![DPDP Act](https://img.shields.io/badge/Compliance-India_DPDP_Act_(Zero--PII)-purple)](#)

A production-ready, minimalist, and cryptographically secure Web3 system for issuing, verifying, and dynamically revoking academic degree credentials with zero-PII on-chain, EIP-712 identity binding, and university examination desk automation.

---

## 🌟 System Highlights & Key Innovations

1. **OpenCerts / Blockcerts Minimalist UI**:
   - Zero-login, zero-gas client-side cryptographic verification in `<140ms` on the home page.
   - Dual-input verification: Paste URL / PRN or Upload Certificate JSON.
   - Interactive Canvas Confetti, glowing tamper-proof badges, and official academic degree cards with printable/PDF export.

2. **India DPDP Act Compliance & Selective Disclosure**:
   - **Zero-PII On-Chain**: No student names, PRNs, or marks are stored on Ethereum. Only 32-byte cryptographic Merkle roots are anchored.
   - **Selective Disclosure**: Students can generate verifiable threshold proofs (e.g., `CGPA >= 7.5`) and redact sensitive identifiers (PRN/Name) when presenting credentials to third parties.

3. **EIP-712 PRN-to-Wallet Identity Binding**:
   - Cryptographically binds student Permanent Registration Numbers (PRNs) to their MetaMask wallet addresses via `eth_signTypedData_v4` and `IdentityRegistry.sol`.

4. **$O(1)$ Dynamic Bitmap Revocation**:
   - `CredentialRegistry.sol` implements a 256-bit dynamic revocation bitmap. Invalidate specific student degrees instantaneously without modifying or recomputing the Merkle root.

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
│       └── sample_batch.csv           # Graduation batch CSV for Exam Cell
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout with responsive Navbar
│   │   ├── page.tsx                   # View 1: Public Drag-and-Drop / URL Verifier
│   │   ├── student/page.tsx           # View 2: Student Portal & EIP-712 Vault
│   │   ├── issuer/page.tsx            # View 3: Exam Cell Batch Minting & Merkle Tree Visualizer
│   │   └── api/
│   │       ├── auth/                  # Server-side HMAC-SHA256 session endpoints
│   │       │   ├── login/route.ts
│   │       │   ├── logout/route.ts
│   │       │   └── session/route.ts
│   │       └── verify/                # Public short verification URL endpoint
│   │           └── [batchId]/[leafIndex]/route.ts
│   ├── components/
│   │   ├── Navbar.tsx                 # Top navigation with network & wallet states
│   │   ├── DropzoneVerifier.tsx       # Dual URL / File dropzone verifier
│   │   ├── DegreeCertificate.tsx      # OpenCerts official degree card renderer & QR code
│   │   ├── MerkleTreeVisualizer.tsx   # Interactive visual Merkle node hierarchy
│   │   ├── ZkProofModal.tsx           # DPDP selective disclosure generator
│   │   ├── BatchRevocationModal.tsx   # Dynamic bitmap revocation modal
│   │   ├── RegisterUniversityModal.tsx# Consortium university onboarding modal
│   │   └── QrScannerModal.tsx         # Mobile camera QR reader
│   ├── context/
│   │   └── AuthContext.tsx            # Cookie-backed server session React context
│   ├── lib/
│   │   ├── crypto.ts                  # Keccak256 canonical hashing & MerkleTree engine
│   │   ├── eip712.ts                  # EIP-712 typed signing & verification
│   │   ├── serverAuth.ts              # Server-side authentication & token signing
│   │   ├── zkProof.ts                 # Selective disclosure proofs verified against real batches
│   │   ├── contracts.ts               # ethers.js Sepolia provider & simulated fallback engine
│   │   ├── storage.ts                 # Storage persistence & ERP sample data
│   │   └── zipHelper.ts               # JSZip bulk student certificate packager
│   └── types/
│       ├── auth.ts                    # Authentication types & department roles
│       └── index.ts                   # W3C and Merkle TypeScript interfaces
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

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Set the server authentication credentials in `.env.local`:
```env
AUTH_SECRET=soet_veritrust_jwt_secret_dev_32_characters_min
ADMIN_PASSWORD=admin@mgm2026
STUDENT_DEFAULT_PASSWORD=student123
```
*(All public Sepolia contract addresses and RPC endpoints are pre-configured).*

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
```bash
npm run build
npm start
```

---

## 🧪 Testing the 3 Operational Views

### View 1: Public Drag-and-Drop / URL Verifier (`/`)
- Choose between **Verify via URL** (enter PRN, short verification URL `?verify=batchId/leafIndex`, or direct URL) or **Upload File** (drop certificate JSON).
- Try 1-click test buttons for **Aarav Sharma** (`PRN20200101`) or **Ananya Deshmukh** (`PRN20200102`).
- Observe client-side verification in `<140ms`, confetti animation, authentic tamper-proof badge, and official degree card with scannable on-chain verification QR code.

### View 2: Student Portal (`/student`)
- Enter PRN `PRN20200101` and password to authenticate via secure HTTP-only cookies.
- Bind MetaMask wallet via EIP-712 cryptographic signature.
- Click **"Download JSON"** to export W3C verifiable credential.
- Click **"Selective Disclosure"** -> Set threshold (e.g. `CGPA >= 7.5`) and enable DPDP PII Redaction -> Download selective disclosure credential.
- Click **"Share Link"** or **"Show QR"** to generate concise, scannable verification links.

### View 3: Exam Cell Batch Minting (`/issuer`)
- Authenticate with authorized Examination Controller credentials (`EXAM_ADMIN_MGM`).
- Upload graduation batch CSV with strict per-row validation -> Real-time 32-byte Merkle Root calculation and interactive DAG visualizer.
- Click **"Anchor Batch to Sepolia"** to anchor on Ethereum Sepolia (or simulated local fallback with visible badge). Duplicate batch IDs are automatically blocked.
- Click **"Download Student JSONs (.zip)"** to package graduation credentials.
- Click **"Manage Revocations"** to revoke any credential via the 256-bit bitmap.

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
