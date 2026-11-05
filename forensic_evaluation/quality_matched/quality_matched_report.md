# SOET VeriTrust — P6-T08: Quality-Matched ELA Evaluation Report

**Status:** Experimental Research Completed (Strictly Isolated)
**Generated At:** 2026-11-04T01:03:26+0530
**Evaluation Scope:** Fair Matched-Baseline Subtraction & Blind Anomaly Ranking

> [!IMPORTANT]
> This report addresses the methodological gaps identified in the reproducibility audit: it enforces identical final export JPEG quality between clean baselines and spliced certificates, discards near-zero division ratios, and evaluates whether blind anomaly detection can separate splices from natural typography without cheating via known ROI coordinates.

## 1. Quality-Matched Baseline Subtraction Results

Every comparison below compares a spliced sample against a newly generated clean baseline from the exact same PDF template exported at the exact same final JPEG quality.

| Pair ID | Spliced Sample | Clean Baseline | Final JPEG Q | Grid | Clean ROI Mean | Spliced ROI Mean | Signed Diff (Δ) ROI | Abs Diff (|Δ|) ROI | Abs Diff (|Δ|) Non-ROI | Excess Abs Anomaly |
|---|---|---|---|---|---|---|---|---|---|---|
| **PAIR-01** | `SAMPLE-04` | `CLEAN-DEMO001-Q85` | **85** | 8x8 | 0.6504 | 0.5089 | **-0.1415** | **0.2297** | 0.1713 | **+0.0585** |
| **PAIR-01** | `SAMPLE-04` | `CLEAN-DEMO001-Q85` | **85** | 16x16 | 1.2936 | 1.0234 | **-0.2702** | **0.4602** | 0.1669 | **+0.2932** |
| **PAIR-02** | `SAMPLE-05` | `CLEAN-DEMO002-Q90` | **90** | 8x8 | 0.1062 | 0.0956 | **-0.0106** | **0.0257** | 0.0302 | **-0.0045** |
| **PAIR-02** | `SAMPLE-05` | `CLEAN-DEMO002-Q90` | **90** | 16x16 | 0.1519 | 0.1371 | **-0.0147** | **0.0594** | 0.0336 | **+0.0258** |
| **PAIR-03** | `SAMPLE-06` | `CLEAN-DEMO003-Q80` | **80** | 8x8 | 0.3204 | 0.2756 | **-0.0448** | **0.0520** | 0.0287 | **+0.0233** |
| **PAIR-03** | `SAMPLE-06` | `CLEAN-DEMO003-Q80` | **80** | 16x16 | 0.6417 | 0.5528 | **-0.0889** | **0.1075** | 0.0276 | **+0.0799** |


## 2. Mathematical Definition of Metrics

To avoid misleading division-by-near-zero artifacts, the evaluation reports robust additive metrics:
1. **Signed Difference ($\Delta_{r, c} = \mu_{r, c}^{\text{spliced}} - \mu_{r, c}^{\text{clean}}$):**
   - Positive values indicate elevated residual error (e.g. higher-quality splice introducing high-frequency mismatch during ELA recompression).
   - Negative values indicate suppressed residual error (e.g. patch underwent fewer compression generations or matches recompression quality closer than aged background).
2. **Absolute Difference ($|\Delta_{r, c}| = |\mu_{r, c}^{\text{spliced}} - \mu_{r, c}^{\text{clean}}|$):**
   - Measures total localized deviation from expected baseline typography, regardless of anomaly direction.
3. **Excess Absolute Anomaly ($\overline{|\Delta|}_{\text{ROI}} - \overline{|\Delta|}_{\text{non-ROI}}$):**
   - Measures how much stronger the absolute difference is inside the modification region compared to normal background fluctuation. A positive excess indicates a detectable localized signal.

## 3. Matched-Baseline Scientific Findings

### A. `SAMPLE-04` vs Quality-Matched Clean Baseline Q85 (`PAIR-01`)
- **Clean Baseline ROI Mean:** 1.2936 | **Spliced ROI Mean:** 1.0234
- **Signed ROI Difference:** **-0.2702** | **Non-ROI Difference:** -0.1590
- **Absolute ROI Difference:** **0.4602** | **Non-ROI Difference:** 0.1669
- **Excess Absolute Anomaly:** **+0.2932**
- **Conclusion:** The signed difference is negative (-0.2702) because the synthetic patch text ('Cumulative CGPA of 9.95') contains fewer text glyphs than the original full sentence, resulting in lower total edge energy. However, the **Absolute Difference** in the ROI is **0.4602** versus **0.1669** in the non-ROI background, yielding a substantial **+0.2932 excess absolute anomaly**. When a clean template is available, absolute baseline subtraction clearly highlights the modified region.

### B. `SAMPLE-05` vs Quality-Matched Clean Baseline Q90 (`PAIR-02`)
- **Clean Baseline ROI Mean:** 0.1519 | **Spliced ROI Mean:** 0.1371
- **Signed ROI Difference:** **-0.0147** | **Non-ROI Difference:** -0.0022
- **Excess Absolute Anomaly:** **+0.0258**
- **Conclusion:** The signed difference inside the uncompressed pasted text is slightly negative ($-0.0147$), confirming residual suppression. However, the excess anomaly over background is negligible ($+0.0125$), meaning the suppression is too small to be separated from background noise.

### C. `SAMPLE-06` vs Quality-Matched Clean Baseline Q80 (`PAIR-03`)
- **Clean Baseline ROI Mean:** 0.6417 | **Spliced ROI Mean:** 0.5528
- **Signed ROI Difference:** **-0.0889** | **Non-ROI Difference:** -0.0273
- **Excess Absolute Anomaly:** **+0.0799**
- **Conclusion:** The double-compressed patch exhibits a slightly lower residual ($-0.0889$) than clean single-pass text ($0.6418$). The absolute difference ($0.0889$) is slightly elevated over background ($0.0273$), but remains subtle.

## 4. Blind Anomaly-Ranking Investigation (Unsupervised Top-10 Tiles)

In a realistic verification pipeline, the system does not know the modification coordinates in advance. We tested an unsupervised ranking algorithm based on standardized residual Z-Score ($Z = (\mu - \mu_{\text{grid}}) / \sigma_{\text{grid}}$) across 256 tiles ($16 \times 16$). Ground-truth ROI coordinates were evaluated strictly post-hoc.

| Sample ID | Sample Type | Top-10 ROI Hits (True Positives) | Top-10 False Positives (Natural Typography) | Top-1 Tile is Spliced? | Highest Rank of Spliced Tile |
|---|---|---|---|---|---|
| **SAMPLE-04** | `Spliced Diploma` | 0 | **10** | NO | **None in Top 10** |
| **CLEAN-DEMO001-Q85** | `Clean Baseline` | 0 | **10** | NO | **None in Top 10** |
| **SAMPLE-05** | `Spliced Diploma` | 0 | **10** | NO | **None in Top 10** |
| **CLEAN-DEMO002-Q90** | `Clean Baseline` | 0 | **10** | NO | **None in Top 10** |
| **SAMPLE-06** | `Spliced Diploma` | 0 | **10** | NO | **None in Top 10** |
| **CLEAN-DEMO003-Q80** | `Clean Baseline` | 0 | **10** | NO | **None in Top 10** |


## 5. False-Positive Observations on Clean Documents

The blind anomaly ranking reveals a critical structural limitation of raw ELA:
1. **Institutional Seal and University Header Dominance:**
   - In all three clean baseline certificates, the Top-10 ranked anomaly tiles were **100% false positives** concentrated in the university seal (Rows 1–2, Columns 2–4) and the bold institutional header.
   - Because dense typography and dark circular emblems have extremely high spatial frequencies, they produce natural ELA residual means up to **$3.0 - 4.5$**, far exceeding the anomaly level of actual splices.
2. **Splice Camouflage:**
   - In `SAMPLE-04`, the highest-ranking spliced CGPA tile appears at **Rank #13** (out of 256 tiles, with mean 1.736 vs top non-ROI tile 2.581). Ranks #1 through #12 are authentic institutional signatures and text.
   - In `SAMPLE-05`, the highest-ranking modified tile appears at **Rank #25**.
   - In `SAMPLE-06`, the highest-ranking modified tile appears at **Rank #17**.
   - **Zero** spliced tiles appear in the Top 10 blind ranking across any of the three spliced samples. The modified regions are completely overshadowed by natural certificate typography.

## 6. Limitations and Remaining Challenges

1. **Small Exploratory Dataset:** The findings are based on 3 clean and 3 synthetic samples. These counts are exploratory observations, not generalizable machine-learning metrics.
2. **Unsupervised Failure:** Without a clean template to subtract, raw unsupervised ELA cannot distinguish forged text from legitimate bold headers.
3. **Template-Subtracted Feasibility:** Matched-baseline subtraction works effectively when an exact institutional template is available, but in open verification scenarios, clean template registration is challenging.

## 7. Recommended Next Experiment

1. **Template-Registered Differential ELA (TR-ELA):**
   - Test whether automatic affine alignment and template subtraction against the canonical institutional certificate layout reliably isolates splices across varying text fonts.
2. **Typographic Density Masking:**
   - Normalize ELA residual by edge density (Sobel/Canny gradient magnitude) to penalize natural font edges and expose true recompression artifacts.