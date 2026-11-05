# SOET VeriTrust — Deployment Configuration Audit & Runtime Readiness Report
**Prompt 43 Verification and Hardening Audit**

- **Project:** SOET VeriTrust – Blockchain-Based Academic Degree Verification & AI Forensics
- **Repository:** `c:\Final-Year-Project-Blockchain\`
- **Date:** November 1, 2026
- **Auditor:** Antigravity AI Senior Systems & Security Agent
- **Status:** Deployment Hardening & Static Configurations **PASS** | Live Docker Runtime **NOT TESTED** (Docker CLI unavailable)

---

## 1. Backup Location

In accordance with strict safety directives, a complete timestamped backup of all relevant deployment and authentication files was created prior to modifications:

- **Backup Directory:** `backups/backup_prompt43_20261101_234300/`
- **Files Preserved:**
  - `Dockerfile.bak`
  - `Dockerfile.ai.bak`
  - `docker-compose.yml.bak`
  - `.dockerignore.bak`
  - `db.ts.bak`
  - `serverAuth.ts.bak`
  - `login_route.ts.bak`
  - `.env.example.bak`
  - `DEPLOYMENT.md.bak`

---

## 2. Files Inspected

The following 12 files were audited in detail during Phase 1:
1. `Dockerfile` (Next.js multi-stage build, dependencies, user privileges, healthcheck)
2. `Dockerfile.ai` (FastAPI image, headless OpenCV, PyTorch, non-root user, curl)
3. `docker-compose.yml` (Service topology, network bridge, volume mapping, dependency policies)
4. `.dockerignore` (Context exclusions for secrets, local databases, build caches, git tracking)
5. `src/lib/db.ts` (SQLite path resolution, WAL PRAGMAs, production guards, graceful shutdown)
6. `src/lib/serverAuth.ts` (Authentication validation, password hashing, session signing)
7. `src/app/api/auth/login/route.ts` (Rate limiting, credentials verification, production guard)
8. `src/app/api/auth/session/route.ts` (Session inspection and cookie parsing)
9. `.env.example` (Environment variable template, default documentation, security warnings)
10. `docs/DEPLOYMENT.md` (Operational manual, persistent storage, backup, update instructions)
11. `package.json` (Next.js 14.2.24, React 18, better-sqlite3 native dependency)
12. `forgery_service/main.py` (FastAPI lifecycle, startup hooks, CORS origins, health contract)

---

## 3. Files Modified and Exact Changes

### 1. `docker-compose.yml`
- **Decoupled Main Application from AI Service Health:**
  Changed `depends_on: forgery-service: condition: service_healthy` to `condition: service_started`. This prevents a degraded or slow-starting AI service from blocking the Next.js web application from booting and serving core cryptographic verifications.
- **Enforced Required Secrets at Compose Layer:**
  Updated `AUTH_SECRET=${AUTH_SECRET:?AUTH_SECRET is required. Generate with 'openssl rand -hex 32' in .env}` and `ADMIN_PASSWORD=${ADMIN_PASSWORD:?ADMIN_PASSWORD is required. Set in .env}`. Prevents Compose from spawning containers with silent blank secrets.
- **Added Explicit Compose Health Checks:**
  Configured matching Docker Compose healthchecks for both `web` (`/api/health`) and `forgery-service` (`/health`).

### 2. `Dockerfile`
- **Updated Healthcheck Target:**
  Replaced `/api/auth/session` with the dedicated readiness endpoint `/api/health` expecting a strict HTTP 200 OK status (`res.statusCode === 200`).

### 3. `src/app/api/health/route.ts` (Created)
- **Dedicated Readiness & Diagnostics Endpoint:**
  Implemented a lightweight GET handler that queries `getDatabaseStatus()`. Returns HTTP 200 `HEALTHY` with database metadata (accessible, journalMode, batchCount, credentialCount) when operational, and returns HTTP 503 `UNHEALTHY` if the database is missing or inaccessible.

### 4. `src/app/api/auth/login/route.ts`
- **Enforced Production Auth Validation on Login:**
  Added runtime guard calling `validateProductionAuthConfig()` when `process.env.NODE_ENV === 'production'`. Rejects login attempts with HTTP 500 if production secrets are missing or using known development defaults (`admin123` or fallback JWT secret).

### 5. `docs/DEPLOYMENT.md`
- **Documented Dedicated Health Check and Decoupled Topology:**
  Updated section 5 with payload specifications for `/api/health` and explained the fault-tolerant container dependency design.

---

## 4. Database Persistence Findings

| Audit Check | Status | Technical Verification |
| :--- | :--- | :--- |
| `DATABASE_PATH` Consistency | `VERIFIED` | Resolves to `process.env.DATABASE_PATH` when set; defaults to `<cwd>/data/veritrust.db` locally. |
| Docker Compose DB Path | `VERIFIED` | Explicitly configured as `DATABASE_PATH=/app/data/veritrust.db`. |
| Named Volume Persistence | `STATICALLY VERIFIED` | Mapped to `veritrust-data:/app/data` (named volume persists across container deletion). |
| Ephemeral /tmp Protection | `VERIFIED` | Production warning logged if Vercel serverless mode is detected without persistent storage; container deployment disables ephemeral pathing. |
| Missing DB Guard in Prod | `VERIFIED` | Throws `CRITICAL PERSISTENCE FAILURE` on missing DB file in production; refuses silent empty DB creation. |
| Auto-Seed Guard | `VERIFIED` | `ALLOW_AUTO_SEED=true` is only honored if DB file is non-existent; existing DB records are never overwritten. |
| Non-Root File Permissions | `STATICALLY VERIFIED` | `Dockerfile` pre-creates `/app/data` owned by `nextjs:nodejs` (UID 1001: GID 1001). `fs.accessSync` validates read/write access. |
| Connection Lifecycle | `VERIFIED` | `closeDatabase()` runs `PRAGMA wal_checkpoint(PASSIVE)` and closes handle idempotently. `SIGINT`/`SIGTERM` handlers registered with single-trigger guard. |

---

## 5. Dockerfile Findings

### Next.js `Dockerfile`:
- **Base Image:** `node:20-bookworm-slim` — `STATICALLY VERIFIED` (Debian 12 Bookworm glibc runtime).
- **Multi-Stage Build:** `deps` $\rightarrow$ `builder` $\rightarrow$ `runner` — `STATICALLY VERIFIED`.
- **Native C++ Compilation:** Installs `python3`, `make`, `g++` in `deps` to compile `better-sqlite3` bindings — `STATICALLY VERIFIED`.
- **Non-Root Execution:** Switches to `USER nextjs` (UID 1001) with pre-owned `/app/data` — `STATICALLY VERIFIED`.
- **Readiness Healthcheck:** Periodic check targeting `/api/health` ensuring HTTP 200 — `STATICALLY VERIFIED`.

### Python AI `Dockerfile.ai`:
- **Base Image:** `python:3.11-slim-bookworm` — `STATICALLY VERIFIED`.
- **System Dependencies:** Installs `libgl1`, `libglib2.0-0`, and `curl` for headless image processing and health monitoring — `STATICALLY VERIFIED`.
- **Non-Root Execution:** Runs as `USER appuser` (UID 1001) — `STATICALLY VERIFIED`.
- **Inference Check:** Targets `/health` reporting `model_trained: false` and `HEURISTIC_BASELINE_UNTRAINED` — `STATICALLY VERIFIED`.

---

## 6. Compose Configuration Findings

- **Service Names & DNS:** `web` and `forgery-service` resolve via internal bridge network `veritrust-net` (`STATICALLY VERIFIED`).
- **Decoupled Architecture:** `web` has `depends_on: forgery-service: condition: service_started`. If the AI container is slow or degraded, the core Next.js application still starts (`STATICALLY VERIFIED`).
- **Secret Interpolation:** Uses `${AUTH_SECRET:?...}` and `${ADMIN_PASSWORD:?...}` to enforce mandatory values (`STATICALLY VERIFIED`).
- **Network Isolation:** Microservice port `8000` is kept internal to `veritrust-net` without exposing it publicly on the host (`STATICALLY VERIFIED`).
- **YAML Validation:** Confirmed 100% valid YAML via Python PyYAML parser (`VERIFIED`).

---

## 7. Production Environment Validation Findings

1. **Authentication Secrets:** `validateProductionAuthConfig()` correctly flags development fallback JWT keys and default `admin123` password when `NODE_ENV=production` (`VERIFIED`).
2. **Reverse Proxy Trust:** `TRUST_PROXY` defaults to `false` in both `.env.example` and `docker-compose.yml`, preventing client-forged IP header rate-limit bypasses (`VERIFIED`).
3. **CORS Topology:** `ALLOWED_ORIGINS` in FastAPI is configured to accept requests from `http://localhost:3000,http://web:3000` (`VERIFIED`).
4. **Context Exclusions:** `.dockerignore` excludes `.env*`, `.git`, `data/*.db*`, `node_modules`, `scratch`, and `backups` (`VERIFIED`).

---

## 8. AI Service Graceful Degradation Findings

- **Architectural Boundary:** Deterministic cryptographic Merkle tree proofs and Ethereum Sepolia on-chain verification are completely decoupled from probabilistic AI forensic scans (`VERIFIED`).
- **Service Failure Handling:** If the AI microservice returns connection error, HTTP 500, or times out, the Next.js API records `aiTamperScan.status: "UNAVAILABLE"` while cryptographic verification continues to validate the document (`VERIFIED`).
- **Non-Blocking Container Startup:** By decoupling the Compose `depends_on` rule to `service_started`, AI service downtime cannot prevent the core university verification service from operating (`STATICALLY VERIFIED`).

---

## 9. Security Concerns Still Unresolved

1. **Shared Student Password Limitation:** In this final-year project demonstration architecture, all students authenticate using their PRN and a shared institutional default password (`STUDENT_DEFAULT_PASSWORD`). For commercial enterprise production, SAML 2.0 / Shibboleth or OIDC SSO integration would be required.
2. **Single-Node SQLite Concurrency:** SQLite WAL mode operates reliably on a single node with local storage, but is unsuitable for multi-node horizontal scaling across clustered container orchestrators (e.g. Kubernetes across multiple nodes with shared NFS).
3. **Untrained AI Model:** The AI microservice operates in heuristic baseline mode until an empirical document forgery dataset (e.g., DocTamper) is acquired and trained.

---

## 10. Tests Executed with Actual Pass/Fail Counts

| Test Suite / Script | Target Domain | Checks | Result |
| :--- | :--- | :--- | :--- |
| `scratch/test_prompt43_readiness_audit.js` | Readiness route, Dockerfile healthcheck, Compose decoupling, Auth guard, Invariance | 16 / 16 | **PASS (100%)** |
| `scratch/test_prompt42_deployment_audit.js` | Database Path Resolution, Missing DB Guard, Dockerfile/Compose Analysis, Invariant Roots | 31 / 31 | **PASS (100%)** |
| `scratch/test_prompt41_ai_audit.py` | PyTorch Architecture, Checkpoints, ELA Preprocessing, Truthful Metadata | 25 / 25 | **PASS (100%)** |
| `scratch/test_prompt40b_full_suite.js` | Session Revocation, Route Auth Guards, Next.js CORS Isolation, Error Sanitization | 25 / 25 | **PASS (100%)** |
| `scratch/test_prompt40a_node_checks.js` | IP Trust & Spoofing Resistance, Session Tokens, RBAC Privilege Isolation | 25 / 25 | **PASS (100%)** |
| `scratch/test_prompt40a_cors.py` | FastAPI CORS Integration, Preflight OPTIONS, Origin Whitelisting | 10 / 10 | **PASS (100%)** |
| `scratch/test_prompt40_all_checks.js` | Scrypt Password Hashing, Rate Limiting, Redacted Batch Records | 18 / 18 | **PASS (100%)** |
| `scratch/test_prompt39_all_checks.js` | Configurable Microservice URL, Fallback Resolution, Graceful Degradation | 33 / 33 | **PASS (100%)** |
| `scratch/test_prompt37_all_checks.js` | Anchor Evidence Cache, Scoping, Eviction, DB Invariance | 55 / 55 | **PASS (100%)** |
| `scratch/test_prompt36_all_checks.js` | 7-Point On-Chain Verification, URL Sanitization, Cross-UI Sync | 46 / 46 | **PASS (100%)** |
| `scratch/test_prompt35_all_checks.js` | Anchor Truthfulness, Merkle Invariance, DID Separation | 49 / 49 | **PASS (100%)** |
| **TOTAL TESTS EXECUTED** | **Comprehensive Full Regression Suite** | **333 / 333** | **100% PASS** |

---

## 11. Checks Not Performed and Why

1. **`docker build` / `docker compose up` Runtime Execution:**
   - **Status:** **NOT TESTED**
   - **Reason:** The Docker CLI executable (`docker`) is not installed on this Windows development host environment (`The term 'docker' is not recognized`). All Dockerfiles, `.dockerignore`, and Compose syntax were verified via strict static AST and parser analysis.
2. **Live Container Network Bridge Packet Inspection:**
   - **Status:** **NOT TESTED**
   - **Reason:** Requires active Docker daemon. Internal DNS (`http://forgery-service:8000`) and URL resolution were verified in TypeScript/Node.js unit tests.

---

## 12. Deployment Blockers

- **Hardware / Tooling Prerequisite:** Deployment to a live container environment requires installing Docker Engine and Docker Compose (e.g., Docker Desktop on Windows or `docker-ce` / `docker-compose-plugin` on Linux).
- **Production Secrets:** An operator deploying in production must create `.env` from `.env.example` and set strong values for `AUTH_SECRET` and `ADMIN_PASSWORD`.

---

## 13. Final Deployment Readiness Assessment

| Deployment Component | Readiness Status | Summary Assessment |
| :--- | :--- | :--- |
| **Next.js Web Application** | **VERIFIED** | Compiles cleanly (`tsc --noEmit`), builds cleanly (`npm run build`), routes verified. |
| **SQLite Persistence Layer** | **VERIFIED** | WAL mode enabled, directory permissions checked, safe missing-DB guard, roots 100% invariant. |
| **FastAPI AI Forensic Microservice** | **VERIFIED** | Startup hooks load cleanly, handles corrupt files safely, reports truthful heuristic baseline. |
| **Docker Configuration** | **STATICALLY VERIFIED** | Valid multi-stage builds, non-root users (UID 1001), dedicated `/api/health` check. |
| **Compose Topology & Decoupling** | **STATICALLY VERIFIED** | Non-blocking `service_started` dependency, named volume persistence, valid PyYAML syntax. |
| **Runtime Container Execution** | **NOT TESTED** | Awaiting deployment on a host with Docker Engine installed. |

---

### Database Integrity Verification (Post-Audit Comparison)

- **Database Path:** `data/veritrust.db`
- **Integrity Check:** `ok`
- **Total Batches:** `2`
  - `MGM-2024-BTECH-BATCH01`: Root `0x73c9d682d5dadeba35e6ad3bf62be75c3e3161bf0136fb5b9043f0f4d656a717` (Status: `INSTITUTIONAL_STORED`, Tx: `null`)
  - `DEMO_GRADUATION_2024_1`: Root `0xf0694dc9f2365b41463b40715cdf291af859d5c316b303d5c4f2b9bb58951040` (Status: `PENDING_ANCHOR`, Tx: `null`)
- **Total Credentials:** `5` (All student records, PRNs, and leaf indices intact).

