# SOET VeriTrust — Zero-Budget AI Microservice Hosting Comparison & Feasibility Correction

**Task Identity:** P6-T12 — Hosting Feasibility Correction & Deployment Configuration Audit  
**Roadmap Phase:** Phase 6 — AI Forensic Evaluation  
**Audit Date:** 2026-11-04  
**Audit Scope:** Reassessment of zero-budget public hosting options for the Python FastAPI ELA microservice following verification of provider pricing and Docker eligibility policies.

---

## 1. Executive Summary & Correction Notice

> [!CAUTION]
> **P6-T11 Policy Correction Regarding Hugging Face Spaces Docker:**  
> The previous task report (P6-T11) recommended Hugging Face Spaces (Docker SDK) as a free-tier hosting platform with 16 GB RAM. **This claim was incorrect.** Current official Hugging Face documentation confirms that creating and running **Docker Spaces is no longer available on the free tier**; it is restricted to paid subscriptions (**PRO plan at $9/month** or Team/Enterprise plans) and **mandates a credit card on file**. Under the strict zero-budget rules of SOET VeriTrust, Hugging Face Docker Spaces is **disqualified**.

---

## 2. Verified Provider Policies (Checked November 4, 2026)

Every candidate platform was investigated using current official documentation:

| Provider | Genuinely Free Tier? | Docker Support on Free Tier? | RAM / CPU Allocation | Inactivity & Sleep Policy | Payment Details (Credit Card) Required? | Official Documentation Reference | Provider Verdict |
|:---|:---:|:---:|:---:|:---|:---:|:---|:---:|
| **Render** | **YES** | **YES** (Native Git Docker build) | **512 MB RAM**, 0.1 vCPU (Shared) | Spins down after 15 minutes of inactivity; 50s–90s cold start | **NO** (No credit card required for free web services) | [render.com/docs/free](https://render.com/docs/free) | **Technically Possible but Resource-Risky** |
| **Hugging Face Spaces** | **NO (for Docker)** | **NO** (Restricted to PRO/Team) | 16 GB RAM, 2 vCPU (Paid PRO tier) | Sleeps after 48 hours | **YES** (Mandatory credit card for $9/mo PRO subscription) | [huggingface.co/docs/hub/spaces-overview](https://huggingface.co/docs/hub/spaces-overview) | **Not Eligible Under Free Plan** |
| **Koyeb** | **NO** | YES | 512 MB RAM, 0.1 vCPU | Spins down after 15 minutes | **YES** (Mandatory credit card with **$29 temporary hold**) | [koyeb.com/docs](https://koyeb.com/docs) | **Not Eligible Under Free Plan** |
| **Fly.io** | **NO** | YES | 256 MB – 512 MB | Pay-per-second | **YES** (Trial limited to 2h compute; credit card required to host) | [fly.io/docs/about/pricing](https://fly.io/docs/about/pricing) | **Not Eligible Under Free Plan** |
| **Railway** | **NO** | YES | 512 MB | Suspends when $5 trial ends | **YES** (Mandatory credit card for ongoing usage) | [docs.railway.com](https://docs.railway.com) | **Not Eligible Under Free Plan** |
| **Oracle Cloud (OCI)** | **Conditional** | YES (VM Instance) | Up to 24 GB (Ampere A1) | Always-on | **YES** (Strict identity & credit card verification; high student rejection) | [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) | **Not Eligible Under Zero-Budget Rule** |
| **Google Cloud Run** | **Conditional** | YES (Serverless Container) | Configurable | Scales to zero | **YES** (GCP billing account with credit card mandatory) | [cloud.google.com/run/pricing](https://cloud.google.com/run/pricing) | **Not Eligible Under Zero-Budget Rule** |

---

## 3. Deep-Dive Resource Suitability: Render Free Web Service

Because **Render** is the only provider that supports custom Docker web services with zero payment details, its technical feasibility was evaluated against empirical local memory and CPU measurements recorded during P6-T11:

### A. Empirical Memory Benchmark vs. Render 512 MB Limit
- **Measured Local Idle Memory:** $\approx 182\text{ MB}$ RSS (Linux container baseline + Python 3.11 runtime + PyTorch 2.2 + pypdfium2 imported in memory).
- **Measured Local Peak Inference Memory:** $\approx 286\text{ MB}$ RSS (Single-page diploma PDF decompression, 144 DPI rasterization, numpy array difference, Euclidean norm calculation).
- **Available Render Headroom:**
  $$512\text{ MB} - 286\text{ MB} = 226\text{ MB} \quad (44.1\% \text{ safety margin})$$

### B. High-Risk Failure Scenarios on 512 MB
1. **Concurrent Request Spikes:**
   If two verification requests arrive concurrently before Python's garbage collector frees previous 10MB PDF buffers and 2-million pixel float32 arrays:
   $$182\text{ MB (base)} + 2 \times 104\text{ MB (inference buffer)} = 390\text{ MB}$$
   Accounting for container cgroup overhead and PyTorch CUDA/CPU tensor allocator fragmentation, memory can surge over $480\text{MB}$, triggering an instant Linux Out-Of-Memory (`OOMKilled`) termination by Render.
2. **Compute Throttling (0.1 vCPU):**
   Render throttles CPU to 10% of a shared core. Operations that take $350\text{ms}$ on a multi-core dev machine may stretch to $3.5\text{s} - 5.0\text{s}$ on Render.
3. **Inactivity Cold Start (50s – 90s):**
   Render spins down after 15 minutes of inactivity. When a verifier uploads a certificate, the wake-up delay will exceed the Next.js verification client timeout ($3000\text{ms}$), causing the initial request to degrade to `UNAVAILABLE` before the microservice finishes booting.

---

## 4. Final Hosting Recommendation

### Verdict: **Technically Possible but Resource-Risky (Render Free Tier)**
- If public deployment is mandated under strict zero-budget rules, **Render Free Web Service** is the only eligible platform that requires no credit card.
- However, it carries significant operational risks: cold-start latency ($>60\text{s}$) and near-ceiling memory usage ($286\text{MB} / 512\text{MB}$).
- The Next.js verifier architecture successfully mitigates these risks: the server-side client enforces an `AbortController` timeout (3s) and gracefully marks the AI scan `UNAVAILABLE` without invalidating cryptographic Merkle verification on Sepolia Ethereum.
