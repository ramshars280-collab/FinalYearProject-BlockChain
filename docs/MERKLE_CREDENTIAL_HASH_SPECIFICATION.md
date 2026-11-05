# Technical Specification: Merkle Credential Hashing in SOET VeriTrust

**Document Version:** 1.0  
**Project:** SOET VeriTrust — Blockchain-Based Academic Credential Verification System  
**Implementation Source:** `src/lib/crypto.ts` (`hashCredentialSubject`, `canonicalStringify`, `buildBatchMerkleTree`)  
**Status:** Canonical Reference Specification  

---

## 1. Overview & Architecture

SOET VeriTrust employs a decoupled, batch-oriented cryptographic architecture. Rather than publishing individual student identity data or submitting expensive per-credential transactions to the Ethereum Sepolia network, degree records are batched into a cryptographic Merkle tree.

Each student credential is represented as a single 32-byte leaf hash computed via Keccak-256 over a canonicalized JSON string. The 32-byte Merkle root of the tree serves as the cryptographic commitment for the entire graduation batch and is anchored either in institutional database storage (`PENDING_ANCHOR` / `INSTITUTIONAL_STORED`) or on the Ethereum blockchain (`ANCHORED`).

---

## 2. Field Whitelist & Coverage

The hashing algorithm explicitly selects and normalizes **11 academic fields** from the `credentialSubject` payload. Any other fields present in the credential document are intentionally excluded from leaf hash computation.

### 2.1 Cryptographically Protected Fields (11)

| Field Name | Description | Normalization & Typing Rule | Example Value |
| :--- | :--- | :--- | :--- |
| `prn` | Permanent Registration Number | String trimmed, converted to **UPPERCASE** | `"DEMO170"` |
| `fullName` | Full name of the graduate | String trimmed, whitespace collapsed | `"NAME170"` |
| `degree` | Academic degree qualification | String trimmed | `"B.Tech"` |
| `branch` | Academic discipline / specialization | String trimmed | `"IT"` |
| `cgpa` | Cumulative Grade Point Average | Numeric cast, fixed to 2 decimals: `Number(cgpa.toFixed(2))` | `6.7` |
| `graduationYear` | Year of degree completion | Integer numeric cast: `Number(year)` | `2024` |
| `issueDate` | Date of certificate issuance | String trimmed (`YYYY-MM-DD`) | `"2024-06-30"` |
| `nheqfCredits` | UGC NHEQF qualification credits | Numeric cast: `Number(credits)` (if present) | `160` |
| `nheqfLevel` | NHEQF qualification framework level | Numeric cast: `Number(level)` (if present) | `6` |
| `university` | Conferring university authority | String trimmed | `"MGM University"` |
| `institutionCode` | AISHE / Consortium institute code | String trimmed | `"MGMU-ENG-01"` |

### 2.2 Excluded Fields (2)

| Field Name | Location in Document | Rationale / Architectural Reason | Cryptographically Protected? |
| :--- | :--- | :--- | :---: |
| `institute` | `credentialSubject.institute` | High-level college name (e.g. *"School of Engineering and Technology (SOET)"*). Excluded from the original hashing schema to allow organizational naming flexibility without invalidating cryptographic roots. | **NO** |
| `id` | `credentialSubject.id` | Decentralized Identifier URI (`did:pkh:eip155:...`). Generated client-side or per-wallet; excluded to prevent wallet migration from invalidating historical degree proofs. | **NO** |

> [!WARNING]
> **Security Implication of Excluded Fields:**  
> Because `institute` and `credentialSubject.id` are excluded from `hashCredentialSubject()`, these excluded fields are **not cryptographically protected by the current Merkle root**. Modifying either of these two properties in a credential JSON document does **not** alter the computed leaf hash. Consequently, an altered `institute` name will still pass Merkle proof verification. Institutional verifiers must rely on `university` and `institutionCode` (which **are** cryptographically bound) to establish institutional provenance.

---

## 3. Normalization & Canonical Stringification

To ensure deterministic leaf hashes across heterogeneous runtime environments (Node.js backend, browser engines, Python microservices), the credential subject is canonicalized according to the following strict rules:

1. **Object Construction:** A dictionary is formed containing only the whitelisted keys present in the record.
2. **Lexicographical Key Sorting:** All keys are sorted alphabetically in standard ASCII order:
   ```
   "branch" < "cgpa" < "degree" < "fullName" < "graduationYear" < "institutionCode" < "issueDate" < "nheqfCredits" < "nheqfLevel" < "prn" < "university"
   ```
3. **Compact Serialization:** The object is serialized into JSON with **zero whitespace** around structural delimiters (`:`, `,`):
   ```json
   {"branch":"IT","cgpa":6.7,"degree":"B.Tech","fullName":"NAME170","graduationYear":2024,"institutionCode":"MGMU-ENG-01","issueDate":"2024-06-30","nheqfCredits":160,"nheqfLevel":6,"prn":"DEMO170","university":"MGM University"}
   ```
4. **UTF-8 Byte Encoding:** The canonical string is encoded directly into binary UTF-8 bytes before hashing.

---

## 4. Keccak-256 Leaf Generation

The 32-byte leaf hash is generated using Ethereum's standard Keccak-256 cryptographic hash function:

$$\text{LeafHash} = \text{keccak256}(\text{toUtf8Bytes}(\text{canonicalString}))$$

For synthetic record `DEMO170`:
- **Canonical Payload:**
  `{"branch":"IT","cgpa":6.7,"degree":"B.Tech","fullName":"NAME170","graduationYear":2024,"institutionCode":"MGMU-ENG-01","issueDate":"2024-06-30","nheqfCredits":160,"nheqfLevel":6,"prn":"DEMO170","university":"MGM University"}`
- **Resulting Leaf Hash:**
  `0xf0694dc9f2365b41463b40715cdf291af859d5c316b303d5c4f2b9bb58951040`

---

## 5. Merkle Tree Construction & Verification

### 5.1 Tree Construction Rules
- **Library:** `merkletreejs` with standard `keccak256`.
- **Pair Sorting (`sortPairs: true`):** When concatenating two sibling nodes $A$ and $B$, the tree sorts them lexicographically before hashing:
  $$\text{Parent} = \text{keccak256}(\min(A, B) \parallel \max(A, B))$$
  This ensures compatibility with OpenZeppelin's Solidity `MerkleProof.sol` contract on Ethereum.
- **Single-Leaf Batch Convention ($N = 1$):**
  When a batch contains exactly one student record (such as `DEMO_GRADUATION_2024_1`):
  - $\text{RootHash} = \text{LeafHash}$
  - The sibling proof array is empty (`proof = []`).
  - Verification succeeds immediately because the leaf hash itself equals the root.

### 5.2 Independent Verification Algorithm
An independent verifier verifies inclusion of a credential as follows:
1. Extract the 11 whitelisted fields from `credentialSubject`.
2. Format the canonical JSON string with sorted keys.
3. Compute $H_0 = \text{keccak256}(\text{canonicalBytes})$.
4. Assert $H_0 == \text{proof.merkleProof.leafHash}$.
5. For each sibling $S_i$ in $\text{proof.merkleProof.proof}$:
   $$H_{i+1} = \text{keccak256}(\min(H_i, S_i) \parallel \max(H_i, S_i))$$
6. Assert $H_{\text{final}} == \text{proof.merkleProof.rootHash}$.
7. Query the registry (or Ethereum smart contract) to confirm that `rootHash` is valid and unrevoked.

---

## 6. Historical Invariance Requirement

> [!IMPORTANT]
> **Strict Compatibility Invariant:**  
> The 11-field whitelist and canonicalization rules defined in this specification are **permanently frozen** for all existing batches:
> - Batch `MGM-2024-BTECH-BATCH01` (Root: `0x73c9d682d5dadeba35e6ad3bf62be75c3e3161bf0136fb5b9043f0f4d656a717`)
> - Batch `DEMO_GRADUATION_2024_1` (Root: `0xf0694dc9f2365b41463b40715cdf291af859d5c316b303d5c4f2b9bb58951040`)
> 
> Any modification to `hashCredentialSubject()`—including the addition of `institute` or changing string normalization—would immediately break mathematical verification of all previously issued credentials and historical Merkle roots.
