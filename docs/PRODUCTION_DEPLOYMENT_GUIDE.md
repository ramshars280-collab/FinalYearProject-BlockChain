# SOET VeriTrust – Production Deployment & Operations Guide

This document establishes the official operational runbook and deployment specification for **SOET VeriTrust**, an enterprise-grade academic credential verification platform anchoring W3C verifiable credentials to the Ethereum Sepolia blockchain with Error Level Analysis (ELA) forensic verification.

---

## 1. Recommended Deployment Architecture

The recommended production architecture utilizes a decoupled two-tier containerized topology behind a secure TLS reverse proxy:

```
                            [Public Internet]
                                   │
                                   ▼ HTTPS (Port 443)
                  ┌─────────────────────────────────┐
                  │ Cloudflare / Edge Reverse Proxy │
                  │ - TLS 1.3 Termination          │
                  │ - DDoS Mitigation & WAF         │
                  │ - Strict Security Headers       │
                  └────────────────┬────────────────┘
                                   │
                                   ▼ Reverse Proxy (HTTP)
       ┌───────────────────────────┴───────────────────────────┐
       │                                                       │
       ▼ Port 3000                                             ▼ Port 8000 (Internal Only)
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│ Next.js 14 Web Application      │                 │ Python FastAPI ELA Microservice │
│ - TypeScript React Frontend     │◄── HTTP Mesh ──►│ - Error Level Analysis (ELA)    │
│ - W3C Credential Verification   │  (Shared Secret)│ - Single Physical Worker        │
│ - Institutional Issuer Portal   │                 │ - Bounded Admission Queue (2)   │
└────────────────┬────────────────┘                 └─────────────────────────────────┘
                 │
                 ├───────────────────────────────┐
                 │                               │
                 ▼                               ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│ Persistent Storage Layer        │   │ Ethereum Sepolia (Chain 11155111│
│ - Turso / libSQL (Serverless)   │   │ - CredentialRegistry Contract   │
│ - OR Persistent Volume Mount    │   │ - StudentIdentityRegistry       │
│   (/app/data/veritrust.db, WAL) │   │ - Zero-Gas eth_call Verification│
└─────────────────────────────────┘   └─────────────────────────────────┘
```

### Infrastructure Specifications
- **Web App (Next.js 14):** Node.js 20 LTS, 1 vCPU, 1GB RAM minimum.
- **Forensic Microservice (FastAPI):** Python 3.11 with PyTorch CPU, 1 vCPU, 1GB RAM. The physical admission controller guarantees single-thread execution, bounding peak RSS to $<512\text{ MB}$.
- **Network Isolation:** The Python FastAPI microservice should NOT be exposed to the public internet. It must reside on an internal private network or service mesh reachable only by the Next.js container via `AI_FORENSIC_SECRET`.

---

## 2. Production Environment Configuration

All environment variables must be populated on your deployment platform (e.g. AWS ECS Parameter Store, Vercel Project Settings, Docker Secrets). A reference template is provided in [`.env.production.example`](file:///.env.production.example).

### Required Variables Reference

| Variable Name | Required? | Example Value | Description |
|---|---|---|---|
| `NODE_ENV` | **Yes** | `production` | Enables production optimizations and security enforcements. |
| `AUTH_SECRET` | **Yes** | `openssl rand -base64 48` | Minimum 32-character high-entropy secret for HMAC-SHA256 session tokens. |
| `ADMIN_PASSWORD` | **Yes** | `Passphrase!2026` | Strong non-default password for `EXAM_ADMIN`. Default `"admin123"` fails closed. |
| `NEXT_PUBLIC_APP_URL` | **Yes** | `https://veritrust.mgmu.ac.in` | Canonical public origin embedded in QR verification links. Resists Host poisoning. |
| `ALLOWED_ORIGINS` | **Yes** | `https://veritrust.mgmu.ac.in` | Whitelist for CORS and CSRF origin validation. |
| `TRUST_PROXY` | **Yes** | `true` | Set `true` behind Cloudflare/ALB to enable accurate rate limiting. |
| `NEXT_PUBLIC_CHAIN_ID` | **Yes** | `11155111` | Strictly configured for Ethereum Sepolia Testnet. |
| `NEXT_PUBLIC_SEPOLIA_RPC` | **Yes** | `https://eth-sepolia.g.alchemy.com/v2/...` | Dedicated high-availability Sepolia JSON-RPC provider. |
| `NEXT_PUBLIC_CREDENTIAL_REGISTRY` | **Yes** | `0xe7Cc39AF2ACC1dd637C863aB5DB18aC904b76Bc4` | Deployed CredentialRegistry contract address on Sepolia. |
| `NEXT_PUBLIC_IDENTITY_REGISTRY` | **Yes** | `0xa8e6B6bAEa48F78eBFeE5967B9836779691c0971` | Deployed StudentIdentityRegistry contract address on Sepolia. |
| `TURSO_DATABASE_URL` | **Conditional** | `libsql://veritrust-prod.turso.io` | Required when deploying to serverless platforms (Vercel). |
| `TURSO_AUTH_TOKEN` | **Conditional** | `jwt_token...` | Turso database authentication token. |
| `ALLOW_LOCAL_SQLITE` | **Conditional** | `true` | Required ONLY when deploying to containers with persistent volumes. |
| `DATABASE_PATH` | **Conditional** | `/app/data/veritrust.db` | Path to persistent volume in container deployments. |
| `ALLOW_AUTO_SEED` | **Yes** | `false` | Must remain `false` in production to prevent masking unmounted storage. |
| `AI_FORENSIC_SERVICE_URL` | **Yes** | `http://forgery-service:8000` | Internal URL of the Python FastAPI microservice. |
| `AI_FORENSIC_SECRET` | **Yes** | `openssl rand -hex 32` | Shared secret token passed in `X-Forensic-Secret` header. |
| `PINATA_JWT` | **Yes** | `eyJhbGciOi...` | JWT token for pinning Merkle batch manifests to IPFS. |

---

## 3. Database Provisioning & Persistence

### 3.1 Option A: Remote libSQL / Turso (Recommended for Serverless)
1. Provision a Turso database:
   ```bash
   turso db create veritrust-prod
   turso db tokens create veritrust-prod
   ```
2. Set `TURSO_DATABASE_URL=libsql://veritrust-prod-[slug].turso.io` and `TURSO_AUTH_TOKEN`.
3. In production (`NODE_ENV=production`), the application validates these credentials on initialization. If missing, it immediately throws a descriptive fatal error, preventing ephemeral local SQLite writes.

### 3.2 Option B: Persistent Container Volume (Docker / Kubernetes)
1. Create a persistent host volume mounted at `/app/data`:
   ```bash
   docker volume create veritrust_data
   docker run -v veritrust_data:/app/data -e ALLOW_LOCAL_SQLITE=true ...
   ```
2. The SQLite driver operates in Write-Ahead Logging (`WAL`) mode with `busy_timeout = 5000ms` and `synchronous = NORMAL`.

### 3.3 Schema Initialization & Seeding Policy
- The schema is automatically created idempotently via `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
- **Seeding Policy:** `ALLOW_AUTO_SEED` defaults to `false`. If the database is completely empty upon startup, the system will NOT auto-seed demo records in production. This prevents masking an accidental storage unmount.

---

## 4. Sepolia RPC & Contract Validation Procedure

Before directing traffic to the production cluster, execute the following read-only verification:

```bash
# Verify Sepolia RPC connectivity and chain ID
curl -s -X POST https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# Expected response: {"jsonrpc":"2.0","id":1,"result":"0xaa36a7"} (11155111 in decimal)

# Verify CredentialRegistry contract bytecode on Sepolia
curl -s -X POST https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["0xe7Cc39AF2ACC1dd637C863aB5DB18aC904b76Bc4", "latest"],"id":1}'
# Expected response: Non-empty bytecode string ("0x60806040...") > 2 bytes
```

If the bytecode response is `"0x"`, the contract is not deployed at that address on Sepolia. The application will detect this and safely refuse to report unconfirmed claims as on-chain verified.

---

## 5. FastAPI Microservice Security & Networking

1. **Authentication:** The microservice validates incoming requests against `AI_FORENSIC_SECRET`. The Next.js API client passes this in the `X-Forensic-Secret` header. Unauthenticated requests receive `HTTP 401 Unauthorized`.
2. **Timing-Safe Comparison:** The secret is verified using `hmac.compare_digest()` to eliminate timing side channels.
3. **Queue & Resource Safeguards:**
   - Single-thread execution (`max_workers=1`).
   - Bounded waiting queue (`AI_MAX_QUEUE_SIZE=2`).
   - Queue wait timeout (`AI_QUEUE_TIMEOUT_SECONDS=8.0`).
   - Physical execution timeout (`AI_INFERENCE_TIMEOUT_SECONDS=25.0`).
   - Memory cleanup: `del contents` and `gc.collect()` executed in a `finally` block.
4. **Heuristic Baseline Disclosure:** The microservice explicitly labels its operational mode as `HEURISTIC_BASELINE_UNTRAINED` unless a fine-tuned PyTorch CNN checkpoint is supplied via `AI_MODEL_CHECKPOINT_PATH`.

---

## 6. HTTPS, CORS & Security Headers

The Next.js configuration in [`next.config.js`](file:///next.config.js) enforces the following HTTP response headers:
- `X-Frame-Options: DENY` (prevents clickjacking attacks)
- `X-Content-Type-Options: nosniff` (prevents MIME sniffing)
- `Referrer-Policy: strict-origin-when-cross-origin` (protects user privacy)
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (forces HTTPS)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` (disables unused browser sensors)

---

## 7. Backup, Disaster Recovery & Rollback

### 7.1 Database Backup Strategy
- **Turso / libSQL:** Automated point-in-time recovery (PITR) is managed by the cloud control plane.
- **SQLite Container Volume:** Run an automated daily cron job using the online backup API:
  ```bash
  sqlite3 /app/data/veritrust.db ".backup '/backups/veritrust_$(date +%Y%m%d_%H%M%S).db'"
  ```

### 7.2 Rollback Procedure
1. If a newly deployed container version encounters defects, roll back the deployment image tag to the prior stable release.
2. The SQLite/libSQL database schema is backwards-compatible; no destructive migrations are performed on startup.

---

## 8. Health Checks & Smoke Test Verification

Execute the following post-deployment smoke tests:

1. **System Health Check:**
   ```bash
   curl -i https://veritrust.mgmu.ac.in/api/health
   # Expected: HTTP 200, status: "healthy", database: "connected"
   ```
2. **AI Forensic Health Check:**
   ```bash
   curl -i https://veritrust.mgmu.ac.in/api/ai/health
   # Expected: HTTP 200, status: "online", engine: "ELAForgeryCNN"
   ```
3. **Public Verification Flow:**
   Navigate to `https://veritrust.mgmu.ac.in/` and upload an authentic sample certificate. Confirm:
   - Green badge displays: `"Blockchain: Verified On-Chain (Sepolia)"`.
   - Claims match certified records.
   - 1-click share URL generates with canonical origin (`https://veritrust.mgmu.ac.in/?verify=...`).

---

## 9. Verification Classification Matrix

To maintain scientific rigor and operational transparency, all checks are categorized below:

| Verification Check | Verification Method | Status | Notes |
|---|---|---|---|
| Sepolia Chain ID (11155111) | Static Config & Automated Test | **VERIFIED LOCALLY** | Enforced by `getNetworkConfig()`. |
| CredentialRegistry Bytecode Check | Read-Only Live RPC Call | **VERIFIED AGAINST SEPOLIA** | Bytecode exists (12,276 bytes) on Sepolia publicnode. |
| IdentityRegistry Bytecode Check | Read-Only Live RPC Call | **VERIFIED AGAINST SEPOLIA** | Bytecode exists (8,708 bytes) on Sepolia publicnode. |
| Production Auth Enforcement | Isolated Automated Test | **VERIFIED LOCALLY** | Missing/weak secret fails closed. |
| SQLite Ephemeral Fallback Guard | Isolated Automated Test | **VERIFIED LOCALLY** | Serverless requires Turso credentials. |
| QR Code Canonical Origin | Isolated Automated Test | **VERIFIED LOCALLY** | Rejects Host header poisoning. |
| Microservice Secret Auth | Unit & Route Testing | **VERIFIED LOCALLY** | `hmac.compare_digest` verified. |
| Production Auto-Seeding Guard | Isolated Automated Test | **VERIFIED LOCALLY** | Empty DB does not seed when `NODE_ENV=production`. |
| Reverse Proxy Rate Limiting | Isolated Automated Test | **VERIFIED LOCALLY** | Token-bucket limiter returns HTTP 429. |
| Live Production Deployment | Hosting Platform Deployment | **REQUIRES DEPLOYMENT** | Awaiting user instruction to provision cloud infrastructure. |
| Production Turso Cloud Latency | External Cloud Benchmark | **REQUIRES DEPLOYMENT** | Dependent on chosen Turso region. |
| Production Domain TLS Cert | Let's Encrypt / Cloudflare | **REQUIRES DEPLOYMENT** | Requires DNS delegation of `mgmu.ac.in`. |

---

## 10. Known Limitations & Unresolved Risks

1. **AI Forensic Engine Maturity:** In the absence of a trained PyTorch model checkpoint (`AI_MODEL_CHECKPOINT_PATH`), the ELA engine operates as an **untrained heuristic baseline** (`HEURISTIC_BASELINE_UNTRAINED`). It is advisory and must never override on-chain cryptographic proofs.
2. **In-Memory Rate Limiter:** The default rate limiter uses in-memory token buckets. For horizontally auto-scaled multi-container deployments, an external Redis or Upstash instance should be wired in.
3. **Public Sepolia RPC Rate Limits:** Public RPC nodes (such as `ethereum-sepolia-rpc.publicnode.com`) enforce request quotas and may experience intermittent throttling. A dedicated provider key (e.g. Alchemy or Infura) is mandatory for production SLA.

