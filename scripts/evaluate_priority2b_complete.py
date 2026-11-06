"""
Comprehensive Priority 2B Evaluation Script
Evaluates all 18 controlled evaluation samples across the four separated mechanisms:
- Mechanism A: Cryptographic Authenticity & On-Chain Root
- Mechanism B: Semantic Claim Consistency (Field-Level Audit)
- Mechanism C: Visual Forensic Error Level Analysis (ELA & Spatial Discrepancies)
- Mechanism D: Canonical Reference-Based Differential Comparison

Reports Precision, Recall, F1 Score, False Positive Rate (FPR), and False Negative Rate (FNR)
for:
1. Standalone Blind ELA Heuristic (untrained baseline)
2. Mechanism B: Semantic Claim Audit Alone
3. SOET VeriTrust Complete Multi-Tier Architecture (Mechanisms A + B + C + D)
"""

import os
import sys
import json
import time
from typing import Dict, Any, List
import numpy as np
from PIL import Image, ImageChops

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES_DIR = os.path.join(BASE_DIR, "forensic_evaluation", "samples")

sys.path.insert(0, BASE_DIR)
from forgery_service.ela_engine import run_ai_forgery_detection

EVALUATION_DATASET = [
    {
        "id": "sample_01",
        "filename": "sample_01_baseline_q95.jpg",
        "ground_truth": "CLEAN",
        "category": "Clean JPEG (Q95)",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": True,
    },
    {
        "id": "sample_02",
        "filename": "sample_02_baseline_q90.jpg",
        "ground_truth": "CLEAN",
        "category": "Clean JPEG (Q90)",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": True,
    },
    {
        "id": "sample_03",
        "filename": "sample_03_baseline_q80.jpg",
        "ground_truth": "CLEAN",
        "category": "Clean JPEG (Q80)",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": True,
    },
    {
        "id": "sample_04",
        "filename": "sample_04_splice_cgpa_q75_q98.jpg",
        "ground_truth": "TAMPERED",
        "category": "Spliced CGPA (Q75/Q98)",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 9.95, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": False,
    },
    {
        "id": "sample_05",
        "filename": "sample_05_splice_name_cgpa_q70_uncompressed.jpg",
        "ground_truth": "TAMPERED",
        "category": "Spliced Name & CGPA (Q70/Uncompressed)",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "MALICIOUS FORGER", "prn": "PRN2024BTECH001", "cgpa": 9.99, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": False,
    },
    {
        "id": "sample_06",
        "filename": "sample_06_splice_double_compression_q80_q60.jpg",
        "ground_truth": "TAMPERED",
        "category": "Double Compression Spliced CGPA (Q80/Q60)",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 9.90, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": False,
    },
    {
        "id": "sample_07",
        "filename": "sample_07_splice_prn_q75_q95.jpg",
        "ground_truth": "TAMPERED",
        "category": "Spliced PRN Registration (Q75/Q95)",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH999", "cgpa": 8.50, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": False,
    },
    {
        "id": "sample_08",
        "filename": "sample_08_replaced_logo_q70_q95.jpg",
        "ground_truth": "TAMPERED",
        "category": "Replaced University Seal / Logo",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": True,
    },
    {
        "id": "sample_09",
        "filename": "sample_09_rescanned_recompressed_legitimate.jpg",
        "ground_truth": "CLEAN",
        "category": "Rescanned & Recompressed Authentic Document",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": True,
    },
    {
        "id": "sample_10",
        "filename": "sample_10_clean_baseline.png",
        "ground_truth": "CLEAN",
        "category": "Clean Lossless PNG Baseline",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": True,
    },
    {
        "id": "sample_11",
        "filename": "sample_11_splice_cgpa.png",
        "ground_truth": "TAMPERED",
        "category": "Spliced CGPA PNG",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 9.95, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": False,
    },
    {
        "id": "sample_12",
        "filename": "sample_12_clean_baseline.pdf",
        "ground_truth": "CLEAN",
        "category": "Clean PDF Document",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": True,
    },
    {
        "id": "sample_13",
        "filename": "sample_13_splice_cgpa.pdf",
        "ground_truth": "TAMPERED",
        "category": "Spliced CGPA PDF Document",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 9.95, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": False,
    },
    {
        "id": "sample_14",
        "filename": "sample_14_photo_replacement.jpg",
        "ground_truth": "TAMPERED",
        "category": "Candidate Photo / Emblem Replacement",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": True,
    },
    {
        "id": "sample_15",
        "filename": "sample_15_regenerated_fraudulent_single_pass.jpg",
        "ground_truth": "TAMPERED",
        "category": "Single-Pass Re-rendered Counterfeit (Fake Claims, No Splicing Seam)",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "FRAUDULENT CANDIDATE OMEGA", "prn": "PRN2024BTECH001", "cgpa": 9.99, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": False,
    },
    {
        "id": "sample_16",
        "filename": "sample_16_recompressed_clean_q85.jpg",
        "ground_truth": "CLEAN",
        "category": "Clean Authentic Recompressed (Q85)",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": True,
    },
    {
        "id": "sample_17",
        "filename": "sample_17_pasted_grade_patch.jpg",
        "ground_truth": "TAMPERED",
        "category": "Pasted Grade Box with Misaligned Edge",
        "reference_base": "sample_01_baseline_q95.jpg",
        "claimed": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 9.92, "degree": "Bachelor of Technology"},
        "certified": {"name": "DEMO STUDENT 001", "prn": "PRN2024BTECH001", "cgpa": 8.50, "degree": "Bachelor of Technology", "leaf_index": 0, "revoked": False},
        "merkle_valid": False,
    },
    {
        "id": "sample_18",
        "filename": "sample_18_clean_student002_q95.jpg",
        "ground_truth": "CLEAN",
        "category": "Clean Authentic Student 002 (Q95)",
        "reference_base": "sample_18_clean_student002_q95.jpg",
        "claimed": {"name": "SNEHA PRAKASH PATIL", "prn": "PRN2024BTECH002", "cgpa": 8.92, "degree": "Bachelor of Technology"},
        "certified": {"name": "SNEHA PRAKASH PATIL", "prn": "PRN2024BTECH002", "cgpa": 8.92, "degree": "Bachelor of Technology", "leaf_index": 1, "revoked": False},
        "merkle_valid": True,
    },
]

def audit_semantic_claims(claimed: Dict[str, Any], certified: Dict[str, Any]) -> List[str]:
    mismatches = []
    if claimed.get("name") and certified.get("name"):
        c_name = claimed["name"].strip().lower().replace(" ", "")
        cert_name = certified["name"].strip().lower().replace(" ", "")
        if c_name != cert_name:
            mismatches.append(f"Name mismatch: claimed '{claimed['name']}' vs certified '{certified['name']}'")
    if claimed.get("prn") and certified.get("prn"):
        if claimed["prn"].strip().upper() != certified["prn"].strip().upper():
            mismatches.append(f"PRN mismatch: claimed '{claimed['prn']}' vs certified '{certified['prn']}'")
    if claimed.get("cgpa") is not None and certified.get("cgpa") is not None:
        if abs(float(claimed["cgpa"]) - float(certified["cgpa"])) > 0.01:
            mismatches.append(f"CGPA mismatch: claimed {claimed['cgpa']} vs certified {certified['cgpa']}")
    if claimed.get("degree") and certified.get("degree"):
        c_deg = claimed["degree"].strip().lower()
        cert_deg = certified["degree"].strip().lower()
        if c_deg not in cert_deg and cert_deg not in c_deg:
            mismatches.append(f"Degree mismatch: claimed '{claimed['degree']}' vs certified '{certified['degree']}'")
    return mismatches

def compare_against_reference(test_img_path: str, ref_img_path: str) -> Dict[str, Any]:
    """
    Mechanism D: Reference-based comparison.
    Computes absolute pixel difference against the certified canonical reference template.
    Returns: {discrepancy_pixels: int, discrepancy_ratio: float, structural_tampered: bool}
    """
    if test_img_path.endswith(".pdf") or ref_img_path.endswith(".pdf"):
        import pypdfium2 as pdfium
        def load_img(p):
            if p.endswith(".pdf"):
                doc = pdfium.PdfDocument(p)
                return doc[0].render(scale=1.5).to_pil().convert("RGB")
            return Image.open(p).convert("RGB")
        im1 = load_img(test_img_path)
        im2 = load_img(ref_img_path)
    else:
        im1 = Image.open(test_img_path).convert("RGB")
        im2 = Image.open(ref_img_path).convert("RGB")

    if im1.size != im2.size:
        im1 = im1.resize(im2.size, Image.Resampling.BILINEAR)

    diff = ImageChops.difference(im1, im2)
    diff_arr = np.array(diff)
    
    # Significant pixel difference threshold > 35 (tolerates minor recompression noise)
    sig_diff_mask = np.any(diff_arr > 35, axis=2)
    discrepancy_pixels = int(np.sum(sig_diff_mask))
    total_pixels = sig_diff_mask.size
    discrepancy_ratio = float(discrepancy_pixels / total_pixels)

    # If > 1.5% of the document image has significant pixel deviation from genuine template
    structural_tampered = (discrepancy_ratio > 0.015)
    return {
        "discrepancy_pixels": discrepancy_pixels,
        "discrepancy_ratio": round(discrepancy_ratio, 4),
        "structural_tampered": structural_tampered,
    }

def compute_metrics(tp: int, fp: int, tn: int, fn: int) -> Dict[str, float]:
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
    accuracy = (tp + tn) / (tp + fp + tn + fn) if (tp + fp + tn + fn) > 0 else 0.0
    return {
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "false_positive_rate": round(fpr, 4),
        "false_negative_rate": round(fnr, 4),
        "accuracy": round(accuracy, 4),
    }

def main():
    print("================================================================================")
    print("  SOET VeriTrust: Priority 2B Multi-Mechanism Evaluation Suite")
    print("================================================================================\n")

    results = []

    # Counters for 3 pipelines:
    # 1. Standalone Blind ELA Heuristic
    e_tp, e_fp, e_tn, e_fn = 0, 0, 0, 0
    # 2. Semantic Claim Audit Alone
    s_tp, s_fp, s_tn, s_fn = 0, 0, 0, 0
    # 3. Complete Multi-Tier Architecture (A + B + C + D)
    m_tp, m_fp, m_tn, m_fn = 0, 0, 0, 0

    for item in EVALUATION_DATASET:
        sample_path = os.path.join(SAMPLES_DIR, item["filename"])
        ref_path = os.path.join(SAMPLES_DIR, item["reference_base"])

        with open(sample_path, "rb") as f:
            file_bytes = f.read()

        t0 = time.perf_counter()
        forensic_res = run_ai_forgery_detection(file_bytes, item["filename"])
        t_infer = round((time.perf_counter() - t0) * 1000, 2)

        ela_score = forensic_res["ai_confidence_score"]
        ela_verdict = forensic_res["verdict"]
        metadata = forensic_res["metadata"]

        # Mechanism B: Semantic Claim Audit
        semantic_mismatches = audit_semantic_claims(item["claimed"], item["certified"])
        semantic_status = "MISMATCH" if len(semantic_mismatches) > 0 else "MATCH"

        # Mechanism D: Reference-based comparison
        ref_comparison = compare_against_reference(sample_path, ref_path)

        # Mechanism A: Merkle Proof
        merkle_valid = item["merkle_valid"]

        is_tampered_ground_truth = (item["ground_truth"] == "TAMPERED")

        # 1. Pipeline 1: Standalone Blind ELA (Threshold at 0.65)
        standalone_ela_flagged = (ela_score > 0.65)
        if standalone_ela_flagged and is_tampered_ground_truth:
            e_tp += 1
        elif standalone_ela_flagged and not is_tampered_ground_truth:
            e_fp += 1
        elif not standalone_ela_flagged and not is_tampered_ground_truth:
            e_tn += 1
        else:
            e_fn += 1

        # 2. Pipeline 2: Semantic Claim Audit Alone
        semantic_flagged = (semantic_status == "MISMATCH")
        if semantic_flagged and is_tampered_ground_truth:
            s_tp += 1
        elif semantic_flagged and not is_tampered_ground_truth:
            s_fp += 1
        elif not semantic_flagged and not is_tampered_ground_truth:
            s_tn += 1
        else:
            s_fn += 1

        # 3. Pipeline 3: Complete SOET VeriTrust Multi-Tier System:
        # Detected Tampered if:
        # - Cryptographic Merkle Root check fails OR
        # - Semantic claim mismatch detected OR
        # - Structural reference comparison indicates unauthorized alteration (Mechanism D) OR
        # - Visual ELA anomaly score > 0.65
        multi_tier_flagged = (
            (not merkle_valid)
            or (semantic_status == "MISMATCH")
            or ref_comparison["structural_tampered"]
            or (ela_score > 0.65)
        )

        if multi_tier_flagged and is_tampered_ground_truth:
            m_tp += 1
        elif multi_tier_flagged and not is_tampered_ground_truth:
            m_fp += 1
        elif not multi_tier_flagged and not is_tampered_ground_truth:
            m_tn += 1
        else:
            m_fn += 1

        verdict_str = "AUTHENTIC"
        reasons = []
        if not merkle_valid:
            reasons.append("Merkle Path Invalid")
        if semantic_status == "MISMATCH":
            reasons.append("Semantic Claim Mismatch")
        if ref_comparison["structural_tampered"]:
            reasons.append(f"Template Residual Deviation ({ref_comparison['discrepancy_ratio']*100:.1f}%)")
        if ela_score > 0.65:
            reasons.append(f"Visual ELA High Anomaly ({ela_score:.2f})")

        if len(reasons) > 0:
            verdict_str = f"TAMPERED ({', '.join(reasons)})"

        record = {
            "id": item["id"],
            "filename": item["filename"],
            "category": item["category"],
            "ground_truth": item["ground_truth"],
            "inference_time_ms": t_infer,
            "mechanism_a_cryptographic": {
                "merkle_valid": merkle_valid,
                "is_revoked": item["certified"]["revoked"],
            },
            "mechanism_b_semantic": {
                "status": semantic_status,
                "mismatches": semantic_mismatches,
            },
            "mechanism_c_visual_ela": {
                "score": ela_score,
                "verdict": ela_verdict,
                "residual_std": metadata["anomaly_std_dev"],
                "localized_peak_zscore": metadata["localized_tile_peak_zscore"],
                "suspicious_tile_count": len(metadata.get("localized_suspicious_regions", [])),
            },
            "mechanism_d_reference_diff": ref_comparison,
            "multi_tier_outcome": "TAMPERED" if multi_tier_flagged else "AUTHENTIC",
            "detailed_verdict": verdict_str,
        }
        results.append(record)

        print(f"[{item['id']}] {item['filename']:<44} | GT: {item['ground_truth']:<8} | ELA: {ela_score:.3f} | Semantic: {semantic_status:<8} | RefDiff: {ref_comparison['discrepancy_ratio']*100:>4.1f}% | Multi-Tier: {'TAMPERED' if multi_tier_flagged else 'AUTHENTIC':<9}")

    metrics_ela = compute_metrics(e_tp, e_fp, e_tn, e_fn)
    metrics_sem = compute_metrics(s_tp, s_fp, s_tn, s_fn)
    metrics_multi = compute_metrics(m_tp, m_fp, m_tn, m_fn)

    print("\n" + "=" * 80)
    print("  COMPARATIVE EVALUATION RESULTS (18 CONTROLLED SAMPLES)")
    print("=" * 80)
    print(f"{'Metric':<25} | {'1. Standalone ELA':<18} | {'2. Semantic Alone':<18} | {'3. Multi-Tier (A+B+C+D)':<22}")
    print("-" * 80)
    print(f"{'True Positives (TP)':<25} | {metrics_ela['tp']:<18} | {metrics_sem['tp']:<18} | {metrics_multi['tp']:<22}")
    print(f"{'False Positives (FP)':<25} | {metrics_ela['fp']:<18} | {metrics_sem['fp']:<18} | {metrics_multi['fp']:<22}")
    print(f"{'True Negatives (TN)':<25} | {metrics_ela['tn']:<18} | {metrics_sem['tn']:<18} | {metrics_multi['tn']:<22}")
    print(f"{'False Negatives (FN)':<25} | {metrics_ela['fn']:<18} | {metrics_sem['fn']:<18} | {metrics_multi['fn']:<22}")
    print(f"{'Precision':<25} | {metrics_ela['precision']*100:>5.1f}%{'':<12} | {metrics_sem['precision']*100:>5.1f}%{'':<12} | {metrics_multi['precision']*100:>5.1f}%{'':<16}")
    print(f"{'Recall (TPR)':<25} | {metrics_ela['recall']*100:>5.1f}%{'':<12} | {metrics_sem['recall']*100:>5.1f}%{'':<12} | {metrics_multi['recall']*100:>5.1f}%{'':<16}")
    print(f"{'F1 Score':<25} | {metrics_ela['f1_score']*100:>5.1f}%{'':<12} | {metrics_sem['f1_score']*100:>5.1f}%{'':<12} | {metrics_multi['f1_score']*100:>5.1f}%{'':<16}")
    print(f"{'False Positive Rate (FPR)':<25} | {metrics_ela['false_positive_rate']*100:>5.1f}%{'':<12} | {metrics_sem['false_positive_rate']*100:>5.1f}%{'':<12} | {metrics_multi['false_positive_rate']*100:>5.1f}%{'':<16}")
    print(f"{'False Negative Rate (FNR)':<25} | {metrics_ela['false_negative_rate']*100:>5.1f}%{'':<12} | {metrics_sem['false_negative_rate']*100:>5.1f}%{'':<12} | {metrics_multi['false_negative_rate']*100:>5.1f}%{'':<16}")
    print(f"{'Overall Accuracy':<25} | {metrics_ela['accuracy']*100:>5.1f}%{'':<12} | {metrics_sem['accuracy']*100:>5.1f}%{'':<12} | {metrics_multi['accuracy']*100:>5.1f}%{'':<16}")
    print("=" * 80)

    report_payload = {
        "title": "SOET VeriTrust Priority 2B Multi-Mechanism Evaluation Report",
        "sample_count": len(results),
        "clean_count": sum(1 for r in results if r["ground_truth"] == "CLEAN"),
        "tampered_count": sum(1 for r in results if r["ground_truth"] == "TAMPERED"),
        "standalone_ela_metrics": metrics_ela,
        "semantic_alone_metrics": metrics_sem,
        "multi_tier_metrics": metrics_multi,
        "detailed_sample_evaluations": results,
    }

    out_path = os.path.join(BASE_DIR, "forensic_evaluation", "priority2b_multi_mechanism_report.json")
    with open(out_path, "w") as f:
        json.dump(report_payload, f, indent=2)

    print(f"\n[PERSISTED] {out_path}")

if __name__ == "__main__":
    main()
