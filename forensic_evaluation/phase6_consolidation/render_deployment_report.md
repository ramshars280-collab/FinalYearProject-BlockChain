# SOET VeriTrust — P6-T13: Render Free Deployment & Controlled Remote Validation

**Task Identity:** P6-T13 — Render Free Deployment & Controlled Remote Validation  
**Roadmap Phase:** Phase 6 — AI Forensic Evaluation (Preserved in official roadmap Phase 0–10)  
**Target Platform:** Render Free Web Service (Docker Runtime, 512 MB RAM, 0.1 vCPU, 100% Free Tier)  
**Status:** **PRE-DEPLOYMENT CHECKS COMPLETED — PAUSED FOR USER AUTHORIZATION**

---

## 1. Pre-Deployment Configuration Verification

The microservice deployment configuration has been verified in [`forgery_service/Dockerfile`](file:///c:/Final-Year-Project-Blockchain/forgery_service/Dockerfile) and [`forgery_service/main.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/main.py):

| Verification Item | Configured State | Audit Verification |
|:---|:---|:---|
| **Base Docker Image** | `python:3.11-slim-bookworm` | Verified compatible with PyTorch 2.2+, Pillow 10+, and pypdfium2. |
| **System Dependencies** | `libgl1`, `libglib2.0-0`, `curl` | Verified: installs headless OpenCV dependencies and curl health probe. |
| **Python Dependencies** | `requirements.txt` | Verified: installs `torch`, `torchvision`, `pypdfium2`, `fastapi`, `uvicorn`. |
| **User Privileges** | Non-root `appuser` (UID 1000) | Verified: adheres to container least-privilege security. |
| **Dynamic Port Binding** | `CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]` | Verified: dynamically reads Render's injected `$PORT` (defaults to 10000 on Render). |
| **Health Check Path** | `GET /health` | Verified: returns HTTP 200 with explicit `model_trained: false`. |
| **Client Environment Variable** | `AI_FORENSIC_SERVICE_URL` | Verified: resolved server-side in [`src/lib/aiConfig.ts`](file:///c:/Final-Year-Project-Blockchain/src/lib/aiConfig.ts). |

---

## 2. Render Deployment Parameters (Zero-Budget Mandatory)

The following exact configuration settings must be applied in the Render Dashboard:

- **Service Type:** **Web Service**
- **Repository:** Connect your GitHub repository: `ramshars280-collab/FinalYearProject-BlockChain`
- **Branch:** `main`
- **Runtime:** **Docker**
- **Root Directory:** `forgery_service`
- **Dockerfile Path:** `Dockerfile` (relative to `forgery_service/`)
- **Instance Type:** **Free ($0/month · 512 MB RAM · 0.1 vCPU)**
- **Health Check Path:** `/health`
- **Environment Variables:**
  - `PORT`: (Managed automatically by Render, defaults to 10000)
  - `ALLOWED_ORIGINS`: `*` (or your Vercel deployment URL)

> [!IMPORTANT]
> Verify that the selected instance type is explicitly **Free ($0/month)**. Render does not require credit card details for eligible free Web Services. If the dashboard prompts for billing details or a paid instance, STOP immediately.

---

## 3. Remote Validation Benchmark Protocol

Once deployed and the public HTTPS URL is provisioned (e.g. `https://soet-veritrust-ai.onrender.com`), the automated validation suite will execute:

1. **Public Health Probe:** Verify `GET /health` returns HTTP 200 with `status: "healthy"` and `forensic_mode: "HEURISTIC_BASELINE_UNTRAINED"`.
2. **Cold-Start Measurement:** Record response latency on the initial wake-up request after 15 minutes of inactivity.
3. **Sequential Health Latency:** Run 10 sequential pings to calculate min, median, avg, and max response time.
4. **Single-PDF Inference Latency:** Execute 10 sequential inference requests with controlled synthetic diploma `SAMPLE-01`.
5. **Controlled Concurrency Stress:** Execute 2 simultaneous inference requests to monitor for 512 MB memory threshold exhaustion.
6. **Next.js Server-Side Integration:** Update `AI_FORENSIC_SERVICE_URL` in `.env.local` and verify end-to-end PDF dual-verification.

---

## 4. Current Task Status

- **Pre-deployment checks:** **COMPLETED**
- **User authorization:** **PAUSED — Awaiting user to connect repository and create free Web Service on Render**
- **Remote measurements:** **PENDING LIVE URL**

