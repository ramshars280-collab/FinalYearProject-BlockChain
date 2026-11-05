# SOET VeriTrust — Phase 6: Readiness & Deployment Audit

**Roadmap Phase:** Phase 6 — AI Forensic Evaluation  
**Task ID:** P6-T10  
**Audit Date:** 2026-11-04  
**Audit Scope:** Verification of the Cryptographic/AI architectural boundary, hosting/performance readiness, and gap analysis against the original master deployment plan.

---

## 1. Cryptographic and AI Boundary Verification

An exhaustive read-only inspection of the verification backend ([`src/app/api/verify/pdf/route.ts`](file:///c:/Final-Year-Project-Blockchain/src/app/api/verify/pdf/route.ts)) and frontend verifier ([`src/components/DropzoneVerifier.tsx`](file:///c:/Final-Year-Project-Blockchain/src/components/DropzoneVerifier.tsx)) was conducted to verify that probabilistic AI heuristics cannot compromise cryptographic certainty:

### Boundary Rule Audit

1. **Merkle Proof Verification is Sole Authoritative Source of Authenticity:**  
   - *Status:* **VERIFIED**
   - *Code Evidence:* [`src/app/api/verify/pdf/route.ts#L526-L591`](file:///c:/Final-Year-Project-Blockchain/src/app/api/verify/pdf/route.ts#L526-L591). The Merkle proof is computed and verified against Sepolia Ethereum contract state before the document can be deemed authentic. If `!onChainResult.isValid`, the endpoint immediately terminates with `isValid: false` and `diagnostic_code: "MERKLE_PROOF_INVALID"`.

2. **AI Diagnostics Cannot Override Valid Cryptographic Proof:**  
   - *Status:* **VERIFIED**
   - *Code Evidence:* [`src/app/api/verify/pdf/route.ts#L628-L681`](file:///c:/Final-Year-Project-Blockchain/src/app/api/verify/pdf/route.ts#L628-L681). Even if the forensic scan reports `HIGH ANOMALY` or `isTamperedByScore = true`, the response preserves `isValid: true` and `tamperDetected: false`, stating: *"Advisory: ELA forensic scan flagged elevated compression anomalies... on-chain cryptographic anchor remains authoritative."*

3. **AI Service Outage Does Not Invalidate Valid Credentials:**  
   - *Status:* **VERIFIED**
   - *Code Evidence:* [`src/app/api/verify/pdf/route.ts#L65-L106`](file:///c:/Final-Year-Project-Blockchain/src/app/api/verify/pdf/route.ts#L65-L106). The AI microservice call is bounded by a 3-second `AbortController`. If offline or timed out, the scan status falls back to `UNAVAILABLE`. In [`L668`](file:///c:/Final-Year-Project-Blockchain/src/app/api/verify/pdf/route.ts#L668), the response returns `isValid: true` with: *"AI forensic scan unavailable; verified via on-chain Merkle root."*

4. **AI Results are Communicated Strictly as Advisory Diagnostics:**  
   - *Status:* **VERIFIED**
   - *Code Evidence:* [`src/components/DropzoneVerifier.tsx#L380-L425`](file:///c:/Final-Year-Project-Blockchain/src/components/DropzoneVerifier.tsx#L380-L425). The UI displays the Merkle proof panel and Forensic Heatmap in distinct visual containers.

5. **User Interface Disclaims Forensic Proof Claims:**  
   - *Status:* **VERIFIED**
   - *Code Evidence:* [`src/components/DropzoneVerifier.tsx#L400-L415`](file:///c:/Final-Year-Project-Blockchain/src/components/DropzoneVerifier.tsx#L400-L415). When `model_trained === false`, a warning badge reads: `"Untrained Baseline Heuristic"`. Explanatory text clarifies that the scan measures statistical JPEG compression residuals (ELA) and does not represent a trained AI forgery detector.

6. **Isolation of Experimental Code:**  
   - *Status:* **VERIFIED**
   - *Evidence:* Neither the spatial grid tiling logic (`evaluate_tiled_ela.py`) nor the Edge-Gradient Normalization logic (`evaluate_egn_ela.py`) has been imported into production code. Production `/api/verify/pdf` calls only the standard FastAPI `/detect-tampering` route.

---

## 2. Hosting and Performance Readiness Audit

The operational status of the AI microservice hosting infrastructure was audited against production criteria:

| Hosting / Performance Requirement | Current Status | Technical Evidence | Verified Limitations & Gaps |
|:---|:---:|:---|:---|
| **FastAPI Local Microservice** | **VERIFIED** | Active process listening on `http://127.0.0.1:8000`. Startup logs confirm Uvicorn running on Python 3.13. | Bound to localhost; accessible only to local dev environment. |
| **Containerization Configuration** | **VERIFIED** | [`forgery_service/Dockerfile.ai`](file:///c:/Final-Year-Project-Blockchain/forgery_service/Dockerfile.ai) and `docker-compose.yml` define self-contained container with PyTorch, pdfium, and Pillow. | Docker image built locally; has not been pushed to a public container registry (e.g. DockerHub/GHCR). |
| **Public HTTPS Hosting** | **NOT STARTED** | None. Endpoint URL defaults to `http://localhost:8000`. | The service is not yet deployed to a zero-budget public cloud host (e.g. Hugging Face Spaces, Render, or Railway). |
| **External Health Monitoring** | **NOT STARTED** | None. Only local Next.js proxy route exists (`/api/ai/health`). | No public uptime ping or external monitoring agent is configured. |
| **Remote Cold-Start Measurement** | **NOT STARTED** | None. Local startup takes $2.9\text{s}$. | Free-tier cloud instances (e.g. Render/HuggingFace) sleep after 15 minutes of inactivity; remote cold-start has not been benchmarked. |
| **Memory Profiling** | **PARTIALLY VERIFIED** | Local Python process consumes $\approx 185\text{MB}$ RSS during PDF rendering and ELA recompression. | Memory usage under continuous burst load on a $512\text{MB}$ free-tier cloud container has not been profiled. |
| **Request Latency Measurement** | **PARTIALLY VERIFIED** | Local inference latency measured at $220\text{ms} - 450\text{ms}$ per certificate PDF. | Remote HTTPS round-trip latency over public network has not been measured. |
| **Concurrent Request Testing** | **NOT STARTED** | Evaluated under sequential single-request conditions. | No concurrency stress test (e.g. 5–10 simultaneous uploads) has been conducted. |
| **Service Timeout Handling** | **VERIFIED** | [`src/app/api/verify/pdf/route.ts#L66`](file:///c:/Final-Year-Project-Blockchain/src/app/api/verify/pdf/route.ts#L66) enforces a strict $3000\text{ms}$ timeout via `AbortController`. | If a remote cold start exceeds $3.0\text{s}$, the verification route gracefully defaults to `UNAVAILABLE` without hanging. |

---

## 3. Phase 6 Completion Gap Analysis

The project implementation was evaluated item-by-item against the original Phase 6 specification in `SOET_VeriTrust_Improvement_and_Zero_Budget_Deployment_Plan(1).docx`:

| Original Phase 6 Requirement | Current Implementation Evidence | Audit Status | Remaining Action Required |
|:---|:---|:---:|:---|
| **Confirm Model Checkpoint Status** | Code inspection confirms `models/ela_forgery_cnn.pth` is missing; model loader explicitly sets `_is_model_trained = False`. | **VERIFIED** | None. Accurately tracked and disclosed. |
| **Do Not Call Untrained CNN an AI Prediction** | DropzoneVerifier displays `"Untrained Baseline Heuristic"`; API diagnostic messages disclaim AI prediction. | **VERIFIED** | None. Complete. |
| **Choose One Honest Path (Path A or Path B)** | Path A chosen: Built and tested a documented ELA/statistical heuristic prototype with reproducible evaluations. | **VERIFIED** | None. Path A fully executed across P6-T01 through P6-T09. |
| **Separate Cryptographic & Forensic Results** | Fully decoupled in Next.js verification route and frontend layout. AI cannot override Merkle proof. | **VERIFIED** | None. Complete. |
| **Use Inconclusive / Advisory Labels** | Verdict terminology updated to `LOW ANOMALY`, `SUSPICIOUS`, `HIGH ANOMALY`, and `UNAVAILABLE`. | **VERIFIED** | None. Complete. |
| **Measure CPU/RAM & Latency on Actual Free Host** | Service runs locally on port 8000. Not yet deployed to a public free-tier host (Render/Railway/HF Spaces). | **BLOCKED** | Deploy FastAPI container to a public free host and benchmark remote cold-start and RAM. |
| **Checklist: Explicit Health & Checkpoint Status** | `/health` endpoint returns JSON with `is_model_trained: false` and `forensic_mode: "HEURISTIC_BASELINE_UNTRAINED"`. | **VERIFIED** | None. Complete. |
| **Checklist: Reproducible Documented Evaluation** | Manifest, reproducible evaluation scripts, and controlled synthetic samples established in `forensic_evaluation/`. | **VERIFIED** | None. Complete. |
| **Checklist: Test Legitimate & Manipulated Samples** | 6 controlled samples (3 clean baselines, 3 splices) tested across multiple recompression and grid settings. | **VERIFIED** | None. Complete. |
| **Checklist: Graceful Degradation on Outage** | 3-second timeout and try/catch fallback implemented. Verification succeeds cryptographically when AI is offline. | **VERIFIED** | None. Complete. |

---

## 4. Phase 6 Readiness Verdict

> [!WARNING]
> **Phase 6 CANNOT be marked complete at this time.**  
> While the scientific, transparency, terminology, boundary, and heuristic evaluation requirements are $100\%$ verified and academically defensible, the hosting requirement (*"Measure CPU/RAM, cold start and inference latency on the actual free host before choosing the model/runtime"*) remains **BLOCKED** pending public cloud container deployment.

### Outstanding Blocker for Phase 6 Closure
1. Deploy `forgery_service/` to a zero-budget public HTTPS host (e.g. Hugging Face Spaces Docker or Render Free Web Service).
2. Configure the production Next.js environment variable `AI_FORGERY_SERVICE_URL`.
3. Measure and document the remote cold-start latency and peak memory usage on that public host.

