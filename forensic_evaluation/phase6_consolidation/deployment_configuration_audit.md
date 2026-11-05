# SOET VeriTrust — Deployment Configuration & Container Audit

**Task Identity:** P6-T12 — Hosting Feasibility Correction & Deployment Configuration Audit  
**Roadmap Phase:** Phase 6 — AI Forensic Evaluation  
**Audit Date:** 2026-11-04  
**Audit Scope:** Deep-dive configuration audit of Dockerfiles, startup scripts, environment variable bindings, and client network topology.

---

## 1. Container Configuration Audit

The repository contains two Dockerfile specifications designed for distinct operational contexts:

### A. Root Multi-Container Specification: [`Dockerfile.ai`](file:///c:/Final-Year-Project-Blockchain/Dockerfile.ai)
- **Primary Use Case:** Local development and production orchestration via [`docker-compose.yml`](file:///c:/Final-Year-Project-Blockchain/docker-compose.yml).
- **Build Context:** Repository root (`context: .`).
- **File Ingestion:**
  - `COPY forgery_service/requirements.txt ./requirements.txt`
  - `COPY --chown=appuser:appuser forgery_service/ ./`
- **Port Binding:** Configured with dynamic fallback:
  ```dockerfile
  ENV PORT=8000
  CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
  ```
- **Healthcheck Path:** Updated in P6-T12 to use dynamic port evaluation:
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:${PORT:-8000}/health || exit 1
  ```
- **Security Execution:** Creates and executes as non-root user `appuser` (UID 1001).

---

### B. Subdirectory Standalone Specification: [`forgery_service/Dockerfile`](file:///c:/Final-Year-Project-Blockchain/forgery_service/Dockerfile)
- **Primary Use Case:** Standalone zero-budget cloud deployment (e.g. Render Root Directory set to `forgery_service` or isolated Git repository).
- **Build Context:** Directory root of `forgery_service/` (`context: forgery_service`).
- **File Ingestion:**
  - `COPY requirements.txt ./requirements.txt`
  - `COPY --chown=appuser:appuser . /app`
- **Port Binding:** Defaults to 8000 locally, dynamically listens on cloud-provided `$PORT`:
  ```dockerfile
  ENV PORT=8000
  CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
  ```
- **Healthcheck Path:**
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:${PORT:-8000}/health || exit 1
  ```
- **Security Execution:** Creates and executes as non-root user `appuser` (UID 1000).

---

### C. Redundancy Assessment: Are Both Dockerfiles Necessary?
- **Finding:** **Both Dockerfiles are intentional, non-conflicting, and serve distinct deployment workflows.**
  1. `Dockerfile.ai` at the root cannot be used if a cloud provider (such as Render) is configured with "Root Directory: forgery_service", because the build context will not contain the parent `forgery_service/` prefix.
  2. `forgery_service/Dockerfile` cannot be directly invoked by root `docker-compose.yml` without modifying relative context paths.
  3. Having both files allows seamless local multi-container composition and zero-config cloud deployment.

---

### D. FastAPI Application Startup Audit: [`forgery_service/main.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/main.py)
- **Port Binding:** Verified that P6-T11 port-handling changes are intact:
  ```python
  if __name__ == "__main__":
      port = int(os.getenv("PORT", "8000"))
      uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
  ```
- **Integrity Check:** Zero forensic scoring formulas, thresholds, or PyTorch CNN layers were modified. The changes were strictly limited to port binding.

---

## 2. Environment Configuration Audit

The client and server network topology was audited across the Next.js codebase:

### A. Environment Variable Resolution
- **Exact Variable Name:** **`AI_FORENSIC_SERVICE_URL`**
  - Confirmed in [`src/lib/aiConfig.ts#L16`](file:///c:/Final-Year-Project-Blockchain/src/lib/aiConfig.ts#L16).
  - Confirmed in [`src/app/api/ai/health/route.ts#L14`](file:///c:/Final-Year-Project-Blockchain/src/app/api/ai/health/route.ts#L14).
  - Confirmed in [`src/app/api/verify/pdf/route.ts#L51`](file:///c:/Final-Year-Project-Blockchain/src/app/api/verify/pdf/route.ts#L51).
  - Confirmed in [`.env.example#L48`](file:///c:/Final-Year-Project-Blockchain/.env.example#L48).
  - Confirmed in [`docker-compose.yml#L22`](file:///c:/Final-Year-Project-Blockchain/docker-compose.yml#L22).
- **No Competing Variables:** No other variable name (such as `AI_FORGERY_SERVICE_URL`) is parsed by the active Next.js source code.

### B. Security & Server-Side Encapsulation
- **Server-Side Exclusivity:** The variable is never prefixed with `NEXT_PUBLIC_`. It is resolved exclusively within server-side API routes (`/api/ai/health` and `/api/verify/pdf`).
- **No Leaked Topology:** Browser bundles never receive the internal microservice IP, port, or cloud domain. All calls are routed through the Next.js server proxy.
- **No Secrets Exposed:** `.env.example` contains only `http://127.0.0.1:8000`. No API keys or private tokens are stored in the AI configuration.

### C. Protocol & Fallback Robustness
- **Protocol Support:** [`validateAIForensicUrl()`](file:///c:/Final-Year-Project-Blockchain/src/lib/aiConfig.ts#L45-L60) explicitly validates both `http:` (local) and `https:` (cloud), permitting immediate switch to a public URL.
- **Graceful Degradation:**
  - `/api/ai/health` enforces a 2000ms timeout.
  - `/api/verify/pdf` enforces a 3000ms timeout with `AbortController`.
  - When the AI service is offline, asleep, or timing out, the verifier sets forensic status to `UNAVAILABLE` and continues cryptographic Merkle tree verification against Sepolia Ethereum without failure.

