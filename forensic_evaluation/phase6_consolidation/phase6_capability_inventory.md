# SOET VeriTrust — Phase 6: AI Forensic Capability Inventory

**Roadmap Phase:** Phase 6 — AI Forensic Evaluation  
**Consolidation Task:** P6-T10  
**Audit Date:** 2026-11-04  
**Audit Scope:** Repository-wide inspection of implemented forensic capabilities, active code paths, and verified limitations.

---

## 1. Executive Summary

This inventory documents the exact implementation status of every forensic and AI capability in the SOET VeriTrust codebase. Each entry is backed by direct code citations and experimental findings across tasks P6-T01 through P6-T09. 

> [!IMPORTANT]
> The SOET VeriTrust AI forensic subsystem operates as an **Untrained Baseline Heuristic** utilizing Error Level Analysis (ELA). The PyTorch convolutional neural network (`ELAForgeryCNN`) exists in code, but no trained checkpoint file (`.pth`) is present. The system explicitly discloses its heuristic status and relies exclusively on cryptographic Merkle tree verification on Sepolia Ethereum for authoritative credential authentication.

---

## 2. Evidence-Based Capability Matrix

| Capability | Implementation Status | Direct Code Evidence | Verified Limitation |
|:---|:---|:---|:---|
| **PDF Rasterization** | **Implemented & Tested** | [`forgery_service/ela_engine.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/ela_engine.py#L175-L196): `extract_image_from_bytes()` uses `pypdfium2` at `scale=2.0` (~144 DPI) directly in memory. | Restricted to single-page certificates; multi-page rendering evaluates only page index 0. |
| **JPEG / PNG Processing** | **Implemented & Tested** | [`forgery_service/ela_engine.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/ela_engine.py#L198-L203): Pillow `Image.open(io.BytesIO(file_bytes)).convert("RGB")`. | Operates purely in RGB; alpha channels and CMYK profiles are flattened or discarded. |
| **ELA Residual Computation** | **Implemented & Tested** | [`forgery_service/ela_engine.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/ela_engine.py#L205-L245): `compute_ela_residual()` saves in-memory JPEG at $Q=90$, computes `ImageChops.difference`, and calculates Euclidean channel norm $\sqrt{\Delta R^2 + \Delta G^2 + \Delta B^2}$. | Sensitive to overall document JPEG export quality. Recompressing pre-quantized documents at $Q=90$ yields different baseline residual baselines depending on prior compression history. |
| **ELAForgeryCNN Architecture** | **Implemented (Code Only)** | [`forgery_service/ela_engine.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/ela_engine.py#L24-L95): 3 Conv2d blocks with BatchNorm, ReLU, MaxPool, AdaptiveAvgPool2d (4x4), and Linear classifier head. | Model exists purely as an architectural skeleton with Kaiming-initialized baseline weights. Does not perform learned feature discrimination. |
| **Trained Checkpoint Availability** | **Not Implemented (Missing)** | [`forgery_service/ela_engine.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/ela_engine.py#L103-L124): `load_ela_checkpoint()` searches for `models/ela_forgery_cnn.pth`. File does not exist on disk. | Explicitly tracked: `_is_model_trained = False`, status reported as `"MISSING: No trained checkpoint found"`. System never claims training. |
| **Model Health & Status Reporting** | **Implemented & Tested** | [`forgery_service/main.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/main.py#L65-L75): `GET /health` returns JSON with `is_model_trained: false`, `checkpoint_status`, `forensic_mode: "HEURISTIC_BASELINE_UNTRAINED"`. | Fully transparent, but returns 200 OK with `is_model_trained: false`, requiring consumer services to parse status. |
| **Statistical Anomaly Scoring** | **Implemented & Tested** | [`forgery_service/ela_engine.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/ela_engine.py#L247-L320): Weighted composite metric combining ELA residual standard deviation ($40\%$), high-error pixel ratio ($30\%$), and untrained model softmax logit ($30\%$). | Untrained CNN logit introduces a static ~0.23 bias that dilutes the heuristic signal. Localized anomalies occupying $<2\%$ canvas area are diluted by global averaging. |
| **Forensic Verdict Terminology** | **Implemented & Verified** | [`forgery_service/ela_engine.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/ela_engine.py#L31-L36): Thresholds $0.25$ and $0.55$ map to `LOW ANOMALY`, `SUSPICIOUS`, and `HIGH ANOMALY`. | Accurately describes compression anomaly levels; does not claim proof of document authenticity or fraud. |
| **Heatmap Visualization Generation** | **Implemented & Tested** | [`forgery_service/ela_engine.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/ela_engine.py#L274-L293): Matplotlib colormap (`turbo`/`plasma`), Gaussian smoothing ($\sigma=1.2$), base64 PNG data URI generation. | Heavy Gaussian smoothing can blur sharp localized patch boundaries; high natural typography creates false-positive thermal hotspots. |
| **AI Diagnostic FastAPI Endpoint** | **Implemented & Tested** | [`forgery_service/main.py`](file:///c:/Final-Year-Project-Blockchain/forgery_service/main.py#L78-L135): `POST /detect-tampering` accepts multipart file upload, executes ELA pipeline, and returns Pydantic-validated diagnostic schema. | Runs locally on port 8000; public HTTPS deployment is not yet provisioned. |
| **Next.js Health Proxy Route** | **Implemented & Tested** | [`src/app/api/ai/health/route.ts`](file:///c:/Final-Year-Project-Blockchain/src/app/api/ai/health/route.ts): Server-side proxy with 4-second timeout querying FastAPI `/health`. Degrades gracefully if unreachable. | Proxies only GET `/health`; does not proxy inference payload uploads. |
| **PDF Verification Integration** | **Implemented & Tested** | [`src/app/api/verify/pdf/route.ts`](file:///c:/Final-Year-Project-Blockchain/src/app/api/verify/pdf/route.ts#L105-L165): Asynchronous call to `detect-tampering` following cryptographic Merkle tree leaf matching. | AI analysis is decoupled from cryptographic validity; failure of AI service does not alter Merkle proof result. |
| **AI Service Failure Handling** | **Implemented & Tested** | [`src/app/api/verify/pdf/route.ts`](file:///c:/Final-Year-Project-Blockchain/src/app/api/verify/pdf/route.ts#L150-L162): `catch` block captures network timeouts/refusals, sets verdict to `UNAVAILABLE`, and preserves cryptographic success. | Verified: Verifier UI displays notice that cryptographic check passed while forensic scan was unavailable. |
| **Cryptographic Independence** | **Implemented & Verified** | [`src/app/api/verify/pdf/route.ts`](file:///c:/Final-Year-Project-Blockchain/src/app/api/verify/pdf/route.ts#L70-L95) and [`src/components/DropzoneVerifier.tsx`](file:///c:/Final-Year-Project-Blockchain/src/components/DropzoneVerifier.tsx): Cryptographic Merkle verification is primary and authoritative. | AI diagnostics are purely advisory; no AI score can override an on-chain cryptographic proof or revoke a valid diploma. |
| **User Interface Transparency** | **Implemented & Verified** | [`src/components/DropzoneVerifier.tsx`](file:///c:/Final-Year-Project-Blockchain/src/components/DropzoneVerifier.tsx#L380-L425): Explicit badge "Untrained Baseline Heuristic", explanation of compression residuals, decoupled layout. | User is explicitly told that the heatmap is an exploratory image residual, not a trained AI forgery verdict. |

---

## 3. Capability Status Distribution

- **Fully Implemented & Operationally Tested:** 10 capabilities ($66.7\%$)
- **Implemented as Architecture Skeleton (Untrained):** 2 capabilities ($13.3\%$)
- **Not Implemented / Pending Deployment:** 3 capabilities ($20.0\%$) (Trained checkpoint, public HTTPS hosting, external latency/load profiling).

