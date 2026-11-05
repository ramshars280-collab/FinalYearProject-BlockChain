# SOET VeriTrust – Production Deployment & Containerization Guide

**Project:** SOET VeriTrust – Blockchain-Based Academic Degree Verification & AI Forensics  
**Architecture:** Single-Instance Next.js 14 + Python FastAPI AI Forensic Microservice + Persistent SQLite (WAL Mode)  

---

## 1. Overview & Architecture Rationale

SOET VeriTrust is architected as an academic verification platform combining:
1. **Deterministic Cryptographic Verification:** Ethereum Sepolia on-chain Merkle root anchors and W3C Verifiable Credentials.
2. **Probabilistic Forensic Verification:** Python FastAPI microservice executing in-memory Error Level Analysis (ELA) and PyTorch CNN analysis.
3. **Institutional Persistence:** SQLite with Write-Ahead Logging (WAL) and strict relational integrity.

### Why SQLite with Persistent Storage?
The system utilizes SQLite (`better-sqlite3`) in **Write-Ahead Logging (WAL)** mode.
- **Suitability:** For single-instance university registrar deployments, SQLite delivers near-zero latency, zero network hops, and transactional ACID guarantees without requiring the operational overhead or connection pooling management of a distributed database engine like PostgreSQL.
- **Architectural Boundary:** SQLite in WAL mode relies on POSIX file-locking primitives across its three database files (`veritrust.db`, `veritrust.db-wal`, `veritrust.db-shm`). It is designed for **single-instance container deployment**. It must **never** be mounted across multiple concurrent container replicas over distributed network filesystems (e.g., NFS, CIFS, AWS EFS without strict POSIX byte-range locking), as this risks database lock corruption.

---

## 2. Prerequisites

- **Docker:** Version 24.0+ or Docker Desktop
- **Docker Compose:** Version 2.20+
- **Host OS:** Linux (Ubuntu 22.04 LTS / Debian 12 recommended for production) or Windows with WSL2
- **Hardware:**
  - Minimum 4 GB RAM (8 GB recommended for simultaneous Next.js build and PyTorch CPU inference)
  - 2+ CPU cores
  - 20 GB free disk space

---

## 3. Environment Variable Configuration

Create a `.env` file in the project root by copying `.env.example`:

```bash
cp .env.example .env
```

### Required Configuration Reference:

| Environment Variable | Description | Required in Production? | Default / Example |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment mode | **YES** | `production` |
| `DATABASE_PATH` | Path to persistent SQLite database file | **YES** | `/app/data/veritrust.db` |
| `ALLOW_AUTO_SEED` | Allows seeding demo batches on fresh install | **YES** | `false` (Set `true` ONLY on day-one initialize) |
| `AI_FORENSIC_SERVICE_URL` | Microservice URL inside container network | **YES** | `http://forgery-service:8000` |
| `AUTH_SECRET` | 64-char cryptographically random secret | **YES** | `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | Registrar / Examination Authority password | **YES** | Strong unique password |
| `STUDENT_DEFAULT_PASSWORD` | Fallback student portal access password | Optional | `student123` (SSO recommended for prod) |
| `ALLOWED_ORIGINS` | CORS allowed origins for FastAPI | **YES** | `http://localhost:3000,http://web:3000` |
| `TRUST_PROXY` | Extract IP from reverse proxy headers | Conditionally | `false` (Set `true` only behind Nginx/ALB) |
| `NEXT_PUBLIC_CREDENTIAL_REGISTRY` | Sepolia smart contract registry address | **YES** | `0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7` |
| `NEXT_PUBLIC_IDENTITY_REGISTRY` | Sepolia identity registry address | **YES** | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| `NEXT_PUBLIC_SEPOLIA_RPC` | Sepolia JSON-RPC provider endpoint | **YES** | `https://ethereum-sepolia-rpc.publicnode.com` |
| `NEXT_PUBLIC_CHAIN_ID` | Sepolia network chain identifier | **YES** | `11155111` |
| `PINATA_JWT` / `PINATA_API_KEY` | Pinata IPFS credential for payload pinning | Optional (Prod) | Required only if pinning new batches |

---

## 4. Container Build & Startup Procedure

### Step 1: Pre-populate Persistent Database (Recommended)
Before starting containers, copy the verified production `veritrust.db` file to your persistent volume location or host data directory:

```bash
mkdir -p data
# Place your existing veritrust.db in ./data/
```

### Step 2: Build Container Images
Build the Next.js multi-stage image and the Python AI forensic image:

```bash
docker compose build
```

### Step 3: Start Services in Detached Mode
Launch the complete stack:

```bash
docker compose up -d
```

### Step 4: Verify Container Status
Check that both containers are running and healthy:

```bash
docker compose ps
```

Expected output:
```text
NAME                IMAGE                      COMMAND                  SERVICE             STATUS                    PORTS
veritrust-ai        final-year-forgery         "uvicorn main:app --…"   forgery-service     Up (healthy)              8000/tcp
veritrust-web       final-year-web             "docker-entrypoint.s…"   web                 Up (healthy)              0.0.0.0:3000->3000/tcp
```

---

## 5. Health Checks & Diagnostic Endpoints

### 1. Web Application & Database Readiness Health Check:
The web container runs a periodic readiness check targeting the dedicated `/api/health` endpoint:
- **Interval:** 30 seconds
- **Command:** `node -e "require('http').get('http://127.0.0.1:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"`
- **External Check:** `curl -i http://localhost:3000/api/health`
- **Response Format (200 OK):**
  ```json
  {
    "status": "HEALTHY",
    "service": "SOET VeriTrust Web & Verification API",
    "timestamp": "2026-11-01T23:45:00.000Z",
    "database": {
      "accessible": true,
      "journalMode": "wal",
      "batches": 2,
      "credentials": 5
    },
    "environment": "production"
  }
  ```
- **Error Behavior:** Returns HTTP 503 `UNHEALTHY` if the persistent database file is missing or inaccessible.

### 2. AI Forensic Microservice Health Check:
The AI container provides a dedicated diagnostic endpoint:
- **Interval:** 30 seconds
- **Command:** `curl -f http://127.0.0.1:8000/health || exit 1`
- **Response Format:**
  ```json
  {
    "status": "HEALTHY",
    "service": "SOET VeriTrust AI Forensic Tamper Detection Microservice",
    "version": "2.0.0",
    "model_trained": false,
    "checkpoint_status": "NONE_DETECTED",
    "forensic_mode": "HEURISTIC_BASELINE_UNTRAINED"
  }
  ```
- **Architectural Decoupling:** In `docker-compose.yml`, `web` depends on `forgery-service` with `condition: service_started`. If the AI container is slow or degraded, the main Next.js web application is **not** blocked from starting. Deterministic cryptographic verification continues to function normally.

---

## 6. Database Backup, Recovery & Retention

### Cold Backup Procedure (Zero-Risk):
1. Stop the web service cleanly to checkpoint WAL logs:
   ```bash
   docker compose stop web
   ```
2. Copy the database directory:
   ```bash
   cp -r ./data /var/backups/veritrust_backup_$(date +%Y%m%d_%H%M%S)
   ```
3. Restart the web service:
   ```bash
   docker compose start web
   ```

### Online Backup (Without Stopping Application):
Use the SQLite safe vacuum/backup command:
```bash
docker compose exec web node -e "
const db = require('./src/lib/db').getDatabase();
db.pragma('wal_checkpoint(PASSIVE)');
db.backup('/app/data/veritrust_hot_backup.db').then(() => console.log('Backup complete'));
"
```

### Recovery Procedure:
If a container fails to start due to a missing database error:
`[VeriTrust Database] CRITICAL PERSISTENCE FAILURE: Production database file not found at configured path...`
1. Check that the Docker volume mount is pointing to the correct directory.
2. Ensure the host database file has read/write permissions for UID 1001:
   ```bash
   chmod 664 data/veritrust.db*
   ```
3. If initializing a brand new demonstration environment, set `ALLOW_AUTO_SEED=true` in `.env` and restart.

---

## 7. Safe Update & Restart Procedures

### Graceful Restart:
To restart services without losing sessions or in-flight requests:
```bash
docker compose restart
```

### Safe Application Upgrade (Preserving Persistent Database):
1. Pull latest source code.
2. Rebuild images:
   ```bash
   docker compose build
   ```
3. Recreate containers without removing volumes:
   ```bash
   docker compose up -d --no-deps web
   ```
> [!CAUTION]
> NEVER execute `docker compose down -v` on a production host. The `-v` flag deletes named persistent volumes and will permanently destroy the SQLite institutional records!

---

## 8. Known Deployment Limitations

1. **Single-Instance Deployment Only:** SQLite WAL mode is not suitable for horizontal active-active multi-instance clusters. Scale vertically or front with Nginx reverse proxy.
2. **AI Model Checkpoint Mode:** Until an empirical academic document forgery dataset (e.g., DocTamper) is trained, the AI microservice truthfully operates in `HEURISTIC_BASELINE_UNTRAINED` mode.
3. **Shared Student Password:** In this final-year project demonstration architecture, students authenticate using PRN and `STUDENT_DEFAULT_PASSWORD`. For enterprise university production, integration with SAML 2.0 / Shibboleth or OAuth2/OIDC is recommended.

