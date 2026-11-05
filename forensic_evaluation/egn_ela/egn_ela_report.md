# SOET VeriTrust — P6-T09: Edge-Gradient Normalized ELA Investigation Report

**Roadmap Phase:** Phase 6 — AI Forensic Evaluation
**Task ID:** P6-T09
**Experiment Type:** Isolated Standalone Investigation (Read-Only to Production)
**Date:** 2026-11-04 01:10:47 +0530

> [!IMPORTANT]
> This experiment investigates whether normalizing Error Level Analysis (ELA) residuals by local Sobel image-gradient magnitude reduces false positives on legitimate certificate typography (seals, bold headings, registrar signatures) or introduces adverse side effects like background noise explosion. Findings are reported with strict scientific honesty.

## 1. Objective and Normalization Methodology

In P6-T08, blind anomaly ranking showed that legitimate diploma typography generates ELA residuals ($2.5 - 4.5$) that overwhelm subtle synthetic splices ($1.0 - 1.7$). To test whether penalizing sharp font edges can suppress typography false positives, we formulated **Edge-Gradient Normalized ELA (EGN-ELA)**:
$$\text{EGN}(x, y) = \frac{\text{ELA}(x, y)}{\epsilon + G_{\text{norm}}(x, y)}$$
Where:
- $\text{ELA}(x, y) = \sqrt{\Delta R^2 + \Delta G^2 + \Delta B^2}$ at JPEG probe quality $Q=90$.
- $G_{\text{norm}}(x, y) = \frac{\sqrt{G_x^2 + G_y^2}}{\max(G)}$ using standard $3 \times 3$ Sobel operators on grayscale.
- $\epsilon \in \{0.01, 0.05, 0.10, 0.50, 1.00\}$ prevents division by zero in flat regions.

## 2. Raw ELA vs. EGN-ELA Direct Comparison (16x16 Grid, 256 Tiles)

All tile rankings were evaluated **strictly blind** before mapping against ground-truth modification regions.

| Sample ID | Sample Type | Metric Setting | Highest Spliced Tile Rank (out of 256) | Top 5 ROI Hits | Top 10 ROI Hits | Top 20 ROI Hits | Top 10 Non-ROI False Positives |
|---|---|---|---|---|---|---|---|
| **SAMPLE-04** | `SPLICED` | **Raw ELA** | **#13** | 0 | 0 | 4 | **10/10** |
| SAMPLE-04 | `SPLICED` | EGN ($\epsilon=0.01$) | **#2** | 2 | 2 | 6 | **8/10** |
| SAMPLE-04 | `SPLICED` | EGN ($\epsilon=0.05$) | **#11** | 0 | 0 | 5 | **10/10** |
| SAMPLE-04 | `SPLICED` | EGN ($\epsilon=0.1$) | **#13** | 0 | 0 | 5 | **10/10** |
| SAMPLE-04 | `SPLICED` | EGN ($\epsilon=0.5$) | **#13** | 0 | 0 | 5 | **10/10** |
| SAMPLE-04 | `SPLICED` | EGN ($\epsilon=1.0$) | **#13** | 0 | 0 | 4 | **10/10** |
| **CLEAN-DEMO001-Q85** | `CLEAN_BASELINE` | **Raw ELA** | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO001-Q85 | `CLEAN_BASELINE` | EGN ($\epsilon=0.01$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO001-Q85 | `CLEAN_BASELINE` | EGN ($\epsilon=0.05$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO001-Q85 | `CLEAN_BASELINE` | EGN ($\epsilon=0.1$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO001-Q85 | `CLEAN_BASELINE` | EGN ($\epsilon=0.5$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO001-Q85 | `CLEAN_BASELINE` | EGN ($\epsilon=1.0$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| **SAMPLE-05** | `SPLICED` | **Raw ELA** | **#25** | 0 | 0 | 0 | **10/10** |
| SAMPLE-05 | `SPLICED` | EGN ($\epsilon=0.01$) | **#23** | 0 | 0 | 0 | **10/10** |
| SAMPLE-05 | `SPLICED` | EGN ($\epsilon=0.05$) | **#22** | 0 | 0 | 0 | **10/10** |
| SAMPLE-05 | `SPLICED` | EGN ($\epsilon=0.1$) | **#23** | 0 | 0 | 0 | **10/10** |
| SAMPLE-05 | `SPLICED` | EGN ($\epsilon=0.5$) | **#25** | 0 | 0 | 0 | **10/10** |
| SAMPLE-05 | `SPLICED` | EGN ($\epsilon=1.0$) | **#26** | 0 | 0 | 0 | **10/10** |
| **CLEAN-DEMO002-Q90** | `CLEAN_BASELINE` | **Raw ELA** | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO002-Q90 | `CLEAN_BASELINE` | EGN ($\epsilon=0.01$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO002-Q90 | `CLEAN_BASELINE` | EGN ($\epsilon=0.05$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO002-Q90 | `CLEAN_BASELINE` | EGN ($\epsilon=0.1$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO002-Q90 | `CLEAN_BASELINE` | EGN ($\epsilon=0.5$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO002-Q90 | `CLEAN_BASELINE` | EGN ($\epsilon=1.0$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| **SAMPLE-06** | `SPLICED` | **Raw ELA** | **#17** | 0 | 0 | 2 | **10/10** |
| SAMPLE-06 | `SPLICED` | EGN ($\epsilon=0.01$) | **#15** | 0 | 0 | 5 | **10/10** |
| SAMPLE-06 | `SPLICED` | EGN ($\epsilon=0.05$) | **#15** | 0 | 0 | 5 | **10/10** |
| SAMPLE-06 | `SPLICED` | EGN ($\epsilon=0.1$) | **#15** | 0 | 0 | 5 | **10/10** |
| SAMPLE-06 | `SPLICED` | EGN ($\epsilon=0.5$) | **#16** | 0 | 0 | 4 | **10/10** |
| SAMPLE-06 | `SPLICED` | EGN ($\epsilon=1.0$) | **#16** | 0 | 0 | 3 | **10/10** |
| **CLEAN-DEMO003-Q80** | `CLEAN_BASELINE` | **Raw ELA** | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO003-Q80 | `CLEAN_BASELINE` | EGN ($\epsilon=0.01$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO003-Q80 | `CLEAN_BASELINE` | EGN ($\epsilon=0.05$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO003-Q80 | `CLEAN_BASELINE` | EGN ($\epsilon=0.1$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO003-Q80 | `CLEAN_BASELINE` | EGN ($\epsilon=0.5$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |
| CLEAN-DEMO003-Q80 | `CLEAN_BASELINE` | EGN ($\epsilon=1.0$) | **N/A (Clean)** | 0 | 0 | 0 | **10/10** |


## 3. Detailed Sample-by-Sample Analysis

### A. `SAMPLE-04` (Spliced CGPA Patch, Final Q=85)
- **Raw ELA:** Highest-ranked spliced tile is at **Rank #13** (0 in Top 5, 0 in Top 10, 4 in Top 20). Authentic signature blocks dominate Ranks #1 through #12.
- **EGN ($\epsilon=0.01$):** Highest spliced tile jumps dramatically to **Rank #2** (2 in Top 5, 2 in Top 10, 6 in Top 20).
- **EGN ($\epsilon=0.05$):** Highest spliced tile is at **Rank #11** (0 in Top 10, 5 in Top 20).
- **EGN ($\epsilon \ge 0.10$):** Highest spliced tile stabilizes at **Rank #13**, identical to Raw ELA.

### B. `SAMPLE-05` (Spliced Name & CGPA, Uncompressed Patches, Final Q=90)
- **Raw ELA:** Highest-ranked spliced tile is at **Rank #25** (0 in Top 20).
- **EGN Across All $\epsilon$ Values:** Highest spliced tile remains between **Rank #22 and Rank #26** (0 in Top 20).
- **Physical Explanation:** In `SAMPLE-05`, the forged uncompressed text undergoes initial compression at $Q=90$, matching the ELA recompression probe quality. The text residual is *suppressed* rather than elevated. Dividing by edge gradient suppresses the signal even further, rendering the splice completely invisible to blind ranking.

### C. `SAMPLE-06` (Double-Compressed CGPA Patch, Final Q=80)
- **Raw ELA:** Highest-ranked spliced tile is at **Rank #17** (0 in Top 10, 2 in Top 20).
- **EGN Across All $\epsilon$ Values:** Highest spliced tile improves slightly to **Rank #15**, but remains outside the Top 10.

## 4. False-Positive Analysis on Clean Baselines (The Critical Flaw)

While $\epsilon=0.01$ appeared to improve the ranking of `SAMPLE-04` (Rank #2), analyzing the quality-matched clean baselines exposes a severe failure mode:
1. **The Low-Gradient Noise Explosion:**
   - On authentic blank parchment, the Sobel gradient magnitude is near zero ($G_{\text{norm}} \approx 0.0001 - 0.001$).
   - With $\epsilon=0.01$, the scaling multiplier $\frac{1}{\epsilon + G}$ reaches **$100.0$**.
   - Even imperceptible JPEG quantization noise ($0.5$ residual) in empty margins explodes into an artificial residual spike ($0.5 \times 100 = 50.0$).
2. **False Positives Shift to Blank Margins:**
   - In `CLEAN-DEMO001-Q85` with $\epsilon=0.01$, **Rank #1 is a completely blank margin tile** (Row 13, Col 12, mean $76.2$), and **Rank #2 is another blank margin tile** (Row 13, Col 3, mean $74.5$)!
   - Instead of eliminating false positives, EGN-ELA with small $\epsilon$ simply **shifted false positives from legitimate text into empty parchment borders**.
3. **Conservative $\epsilon$ Collapses into Raw ELA:**
   - When $\epsilon$ is increased to $0.10$ or $0.50$ to stop background noise from exploding, the denominator is dominated by $\epsilon$.
   - The resulting tile rankings become virtually identical to raw ELA, re-establishing legitimate typography as the dominant false positive.

## 5. Diagnostic Visualizations Catalog

All visualizations are saved in `forensic_evaluation/egn_ela/`:
- `epsilon_sensitivity_trajectory.png`: Trajectory plot showing highest spliced tile rank as a function of $\epsilon$.
- `SAMPLE-04` Visualizations:
  - Feature Triple (Raw ELA, Sobel Gradient, EGN-ELA): `feature_triple_sample-04.png`
  - 16x16 Blind Ranking Comparison (Raw vs EGN): `ranking_comparison_sample-04_16x16.png`
- `CLEAN-DEMO001-Q85` Visualizations:
  - Feature Triple (Raw ELA, Sobel Gradient, EGN-ELA): `feature_triple_clean-demo001-q85.png`
  - 16x16 Blind Ranking Comparison (Raw vs EGN): `ranking_comparison_clean-demo001-q85_16x16.png`
- `SAMPLE-05` Visualizations:
  - Feature Triple (Raw ELA, Sobel Gradient, EGN-ELA): `feature_triple_sample-05.png`
  - 16x16 Blind Ranking Comparison (Raw vs EGN): `ranking_comparison_sample-05_16x16.png`
- `CLEAN-DEMO002-Q90` Visualizations:
  - Feature Triple (Raw ELA, Sobel Gradient, EGN-ELA): `feature_triple_clean-demo002-q90.png`
  - 16x16 Blind Ranking Comparison (Raw vs EGN): `ranking_comparison_clean-demo002-q90_16x16.png`
- `SAMPLE-06` Visualizations:
  - Feature Triple (Raw ELA, Sobel Gradient, EGN-ELA): `feature_triple_sample-06.png`
  - 16x16 Blind Ranking Comparison (Raw vs EGN): `ranking_comparison_sample-06_16x16.png`
- `CLEAN-DEMO003-Q80` Visualizations:
  - Feature Triple (Raw ELA, Sobel Gradient, EGN-ELA): `feature_triple_clean-demo003-q80.png`
  - 16x16 Blind Ranking Comparison (Raw vs EGN): `ranking_comparison_clean-demo003-q80_16x16.png`


## 6. Scientific Limitations & Conclusion

1. **Experimental Finding:**
   - EGN-ELA **does not provide a robust or consistent improvement** for blind document forgery detection.
   - Small $\epsilon$ values ($0.01$) artificially promote certain spliced regions but severely corrupt clean certificates by turning empty margins into extreme false-positive anomalies.
   - Larger $\epsilon$ values ($0.1 - 1.0$) fail to suppress typography, yielding rankings nearly indistinguishable from raw ELA.
2. **No Blind Detection Capability:**
   - Across all 6 samples and all 5 epsilon settings, **no single parameter setting achieved consistent blind separation** between forged regions and authentic document features.
3. **Production Status:**
   - EGN-ELA **must NOT be integrated into production**. It remains an exploratory diagnostic study demonstrating the physical limitations of gradient-divided recompression analysis.
4. **Cryptographic Supremacy:**
   - This experiment confirms once again why heuristic image analysis cannot guarantee credential authenticity. **Cryptographic Merkle tree verification on Sepolia Ethereum remains the only authoritative, tamper-proof verification mechanism in SOET VeriTrust**.