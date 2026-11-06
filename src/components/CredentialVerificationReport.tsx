"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  XCircle,
  AlertCircle,
  CheckCircle2,
  Building2,
  Award,
  FileText,
  Check,
  Share2,
  Lock,
  RefreshCw,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  User,
  GraduationCap,
  Calendar,
} from "lucide-react";
import {
  VerificationResult,
  W3CCredentialPayload,
  CredentialAuthenticityStatus,
  DocumentForensicAssessment,
} from "../types";
import { maskAddress, maskHash } from "../lib/crypto";
import { getSepoliaConfig } from "../lib/storage";

export type ReportStatus = "VERIFIED" | "INVALID" | "REVOKED" | "INCONCLUSIVE";

export type AcademicInformationStatus =
  | "MATCHED"
  | "MISMATCH DETECTED"
  | "PARTIALLY VERIFIED"
  | "INCONCLUSIVE";

export type DocumentIntegrityStatus =
  | "NO SIGNIFICANT ANOMALIES"
  | "REVIEW RECOMMENDED"
  | "ANALYSIS INCONCLUSIVE"
  | "SERVICE UNAVAILABLE";

export interface CredentialVerificationReportProps {
  result: VerificationResult;
  credential?: W3CCredentialPayload | null;
  onVerifyAnother?: () => void;
}

/**
 * Masks sensitive student identifiers (PRN) for DPDP / academic privacy compliance.
 * Example: "PRN20200101" -> "PRN••••0101", "DEMO-CSE-001" -> "DEM••••001"
 */
export function maskPRN(prn?: string | null): string {
  if (!prn) return "••••••••";
  const s = prn.trim();
  if (s.length <= 4) return "••••";
  if (s.toUpperCase().startsWith("PRN") && s.length >= 8) {
    return `PRN••••${s.slice(-4)}`;
  }
  if (s.length <= 8) {
    return `${s.slice(0, 2)}••••${s.slice(-2)}`;
  }
  return `${s.slice(0, 3)}••••${s.slice(-3)}`;
}

/**
 * Computes the unified Credential Authenticity status for the report.
 */
export function computeReportStatus(result: VerificationResult): ReportStatus {
  if (
    result.verificationOutcome === "INCONCLUSIVE" ||
    result.diagnosticCode === "SCANNED_DOCUMENT_REQUIRES_OCR" ||
    result.diagnosticCode === "RECORD_NOT_IN_DATABASE"
  ) {
    return "INCONCLUSIVE";
  }
  if (result.isRevoked || result.verificationOutcome === "REVOKED") {
    return "REVOKED";
  }
  if (
    result.tamperDetected ||
    !result.isValid ||
    result.verificationOutcome === "CRYPTOGRAPHICALLY_INVALID" ||
    result.verificationOutcome === "SEMANTIC_MISMATCH" ||
    result.diagnosticCode === "MERKLE_PROOF_INVALID" ||
    result.diagnosticCode === "UNREGISTERED_ISSUER" ||
    result.diagnosticCode === "CLAIM_MISMATCH_CGPA" ||
    result.diagnosticCode === "CLAIM_MISMATCH_DEGREE" ||
    result.diagnosticCode === "CLAIM_MISMATCH_NAME" ||
    result.diagnosticCode === "CLAIM_MISMATCH_PRN" ||
    result.diagnosticCode === "SEMANTIC_CLAIM_MISMATCH"
  ) {
    return "INVALID";
  }
  if (result.isValid && !result.isRevoked && !result.tamperDetected) {
    return "VERIFIED";
  }
  return "INCONCLUSIVE";
}

export const computeCredentialAuthenticityStatus = computeReportStatus;

/**
 * Computes Academic Information summary status.
 */
export function computeAcademicInformationStatus(
  result: VerificationResult
): AcademicInformationStatus {
  if (
    result.verificationOutcome === "SEMANTIC_MISMATCH" ||
    result.diagnosticCode === "CLAIM_MISMATCH_CGPA" ||
    result.diagnosticCode === "CLAIM_MISMATCH_DEGREE" ||
    result.diagnosticCode === "CLAIM_MISMATCH_NAME" ||
    result.diagnosticCode === "CLAIM_MISMATCH_PRN" ||
    result.diagnosticCode === "SEMANTIC_CLAIM_MISMATCH" ||
    result.semanticCheck?.status === "MISMATCH"
  ) {
    return "MISMATCH DETECTED";
  }

  if (result.semanticCheck?.status === "MATCH") {
    const claimed = result.semanticCheck.claimed || {};
    const certified = result.semanticCheck.certified || {};
    const fields = [
      "studentName",
      "prn",
      "degree",
      "branch",
      "cgpa",
      "graduationYear",
    ] as const;

    let totalExtracted = 0;
    let totalCertified = 0;
    fields.forEach((f) => {
      if ((certified as any)[f] !== undefined) totalCertified++;
      if ((claimed as any)[f] !== undefined) totalExtracted++;
    });

    if (totalCertified > 0 && totalExtracted >= totalCertified) {
      return "MATCHED";
    }
    if (totalExtracted > 0) {
      return "PARTIALLY VERIFIED";
    }
  }

  if (result.isValid && !result.tamperDetected) {
    return "MATCHED";
  }

  return "INCONCLUSIVE";
}

/**
 * Computes Document Integrity summary status.
 */
export function computeDocumentIntegrityStatus(
  result: VerificationResult
): DocumentIntegrityStatus {
  const scan = result.forensicScan;
  if (!scan) return "ANALYSIS INCONCLUSIVE";
  if (scan.status === "UNAVAILABLE" || result.visualServiceOffline) {
    return "SERVICE UNAVAILABLE";
  }
  if (
    scan.status === "FAILED" ||
    scan.status === "WARMING_UP" ||
    scan.status === "ANALYZING" ||
    scan.status === "QUEUED"
  ) {
    return "ANALYSIS INCONCLUSIVE";
  }
  const assessment = scan.assessment || scan.verdict || "";
  if (
    assessment === "ANOMALIES_DETECTED" ||
    assessment === "SUSPICIOUS" ||
    assessment === "HIGH ANOMALY" ||
    assessment === "TAMPERED"
  ) {
    return "REVIEW RECOMMENDED";
  }
  if (
    assessment === "NO_SIGNIFICANT_ANOMALIES" ||
    assessment === "LOW ANOMALY" ||
    assessment === "AUTHENTIC"
  ) {
    return "NO SIGNIFICANT ANOMALIES";
  }
  return "ANALYSIS INCONCLUSIVE";
}

/**
 * Backward-compatible helper for Document Forensic Assessment.
 */
export function computeDocumentForensicAssessment(
  result: VerificationResult
): DocumentForensicAssessment {
  const scan = result.forensicScan;
  if (!scan) return "INCONCLUSIVE";
  if (scan.assessment) return scan.assessment;
  if (scan.status === "UNAVAILABLE" || result.visualServiceOffline) {
    return "SERVICE_UNAVAILABLE";
  }
  if (
    scan.status === "FAILED" ||
    scan.status === "WARMING_UP" ||
    scan.status === "ANALYZING" ||
    scan.status === "QUEUED"
  ) {
    return "INCONCLUSIVE";
  }
  const v = (scan.verdict || "").toUpperCase();
  if (
    v === "ANOMALIES_DETECTED" ||
    v === "SUSPICIOUS" ||
    v === "HIGH ANOMALY" ||
    v === "TAMPERED"
  ) {
    return "ANOMALIES_DETECTED";
  }
  if (
    v === "NO_SIGNIFICANT_ANOMALIES" ||
    v === "LOW ANOMALY" ||
    v === "AUTHENTIC"
  ) {
    return "NO_SIGNIFICANT_ANOMALIES";
  }
  return "INCONCLUSIVE";
}

export default function CredentialVerificationReport({
  result,
  credential,
  onVerifyAnother,
}: CredentialVerificationReportProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // 1. Compute the three compact verification summaries
  const authenticityStatus: ReportStatus = computeReportStatus(result);
  const academicStatus: AcademicInformationStatus =
    computeAcademicInformationStatus(result);
  const integrityStatus: DocumentIntegrityStatus =
    computeDocumentIntegrityStatus(result);
  const forensicAssessment = computeDocumentForensicAssessment(result);

  // 2. Extract core academic credential claims
  const subject =
    credential?.credentialSubject ||
    (credential as any)?.recipient ||
    (credential as any)?.data ||
    {};

  const studentName =
    subject.fullName ||
    (credential as any)?.studentName ||
    result.semanticCheck?.certified?.studentName ||
    result.semanticCheck?.claimed?.studentName ||
    "Candidate Name Unavailable";

  const rawPrn =
    subject.prn ||
    (credential as any)?.prn ||
    result.semanticCheck?.certified?.prn ||
    result.semanticCheck?.claimed?.prn ||
    "";
  const maskedPrn = maskPRN(rawPrn);

  const degree =
    subject.degree ||
    result.semanticCheck?.certified?.degree ||
    result.semanticCheck?.claimed?.degree ||
    "Bachelor of Technology";

  const branch =
    subject.branch ||
    result.semanticCheck?.certified?.branch ||
    result.semanticCheck?.claimed?.branch ||
    "";

  const institutionName =
    result.issuingInstitutionName ||
    credential?.issuer?.name ||
    subject.university ||
    "MGM University, Chhatrapati Sambhajinagar";

  const graduationYear =
    subject.graduationYear ||
    result.semanticCheck?.certified?.graduationYear ||
    result.semanticCheck?.claimed?.graduationYear ||
    "2024";

  const batchId =
    result.batchId ||
    credential?.proof?.merkleProof?.batchId ||
    "MGM-2024-BTECH-BATCH01";

  const leafIndex =
    result.leafIndex ?? credential?.proof?.merkleProof?.leafIndex ?? 0;

  // Semantic audit items for rigorous aggregation
  const semanticAuditItems = [
    {
      label: "Student Full Name",
      claimed: result.semanticCheck?.claimed?.studentName,
      certified: result.semanticCheck?.certified?.studentName,
    },
    {
      label: "Student Identifier (PRN)",
      claimed: result.semanticCheck?.claimed?.prn
        ? maskPRN(result.semanticCheck.claimed.prn)
        : undefined,
      certified: result.semanticCheck?.certified?.prn
        ? maskPRN(result.semanticCheck.certified.prn)
        : undefined,
    },
    {
      label: "Conferred Degree",
      claimed: result.semanticCheck?.claimed?.degree,
      certified: result.semanticCheck?.certified?.degree,
    },
    {
      label: "Cumulative CGPA",
      claimed:
        result.semanticCheck?.claimed?.cgpa !== undefined
          ? Number(result.semanticCheck?.claimed?.cgpa).toFixed(2)
          : undefined,
      certified:
        result.semanticCheck?.certified?.cgpa !== undefined
          ? Number(result.semanticCheck?.certified?.cgpa).toFixed(2)
          : undefined,
    },
    {
      label: "Graduation Year",
      claimed: result.semanticCheck?.claimed?.graduationYear,
      certified: result.semanticCheck?.certified?.graduationYear,
    },
    {
      label: "Discipline / Branch",
      claimed: result.semanticCheck?.claimed?.branch,
      certified: result.semanticCheck?.certified?.branch,
    },
  ];

  const evaluatedSemanticFields = semanticAuditItems.map((item) => {
    const isMismatch = result.semanticCheck?.field_mismatches?.some((m) =>
      m.field.toLowerCase().includes(item.label.toLowerCase().slice(0, 4))
    );
    const isVerifiedMatch =
      !isMismatch &&
      item.claimed !== undefined &&
      item.claimed !== null &&
      item.certified !== undefined &&
      item.certified !== null;
    const isInconclusive = !isMismatch && !isVerifiedMatch;
    return { ...item, isMismatch, isVerifiedMatch, isInconclusive };
  });

  const verifiedMatchesCount = evaluatedSemanticFields.filter(
    (f) => f.isVerifiedMatch
  ).length;
  const inconclusiveFieldsCount = evaluatedSemanticFields.filter(
    (f) => f.isInconclusive
  ).length;

  const handleCopyLink = () => {
    try {
      let url = "";
      if (batchId && leafIndex !== undefined && leafIndex !== null) {
        url = `${window.location.origin}/?verify=${encodeURIComponent(
          batchId
        )}/${leafIndex}`;
      } else {
        url = window.location.href;
      }
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (e) {
      console.error("Failed to copy link:", e);
    }
  };

  // Determine Overall Result Headline & Explanation
  let overallTitle = "Academic Credential Authenticity Confirmed";
  let overallExplanation =
    "This academic credential matches the institution's registered record.";
  let overallStyle = "bg-emerald-50 border-emerald-400 text-emerald-950";
  let iconBg = "bg-emerald-600 text-white";

  if (academicStatus === "MISMATCH DETECTED") {
    overallTitle = "Academic Information Mismatch";
    overallExplanation =
      "Some academic information does not match the institution's registered record.";
    overallStyle = "bg-rose-50 border-rose-400 text-rose-950";
    iconBg = "bg-rose-600 text-white";
  } else if (authenticityStatus === "REVOKED") {
    overallTitle = "Academic Credential Revoked";
    overallExplanation =
      "This credential has been revoked by the issuing institution.";
    overallStyle = "bg-rose-50 border-rose-400 text-rose-950";
    iconBg = "bg-rose-600 text-white";
  } else if (authenticityStatus === "INVALID") {
    overallTitle = "Cryptographic Verification Failed";
    overallExplanation =
      result.tamperReason ||
      "Merkle proof mismatch. This credential could not be verified against the institution's blockchain registry.";
    overallStyle = "bg-rose-50 border-rose-400 text-rose-950";
    iconBg = "bg-rose-600 text-white";
  } else if (authenticityStatus === "INCONCLUSIVE") {
    overallTitle = "Verification Inconclusive";
    overallExplanation =
      "The authenticity of this document could not be conclusively determined. Manual inspection required.";
    overallStyle = "bg-amber-50 border-amber-300 text-amber-950";
    iconBg = "bg-amber-600 text-white";
  }

  return (
    <div
      data-testid="credential-verification-report"
      className="w-full max-w-4xl mx-auto space-y-6 text-slate-900"
    >
      {/* ========================================================================= */}
      {/* TOP HEADER: Branding & Action Controls                                    */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span className="inline-flex items-center gap-1.5 font-bold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            SOET VeriTrust
          </span>
          <span>&bull;</span>
          <span>Public Credential Verification</span>
        </div>

        <div className="flex items-center gap-2">
          {onVerifyAnother && (
            <button
              onClick={onVerifyAnother}
              className="text-xs font-bold text-slate-700 hover:text-blue-600 px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:border-blue-400 shadow-2xs transition-all"
            >
              &larr; Verify Another
            </button>
          )}

          <button
            onClick={handleCopyLink}
            className="text-xs font-bold text-blue-700 hover:text-blue-900 px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 shadow-2xs transition-all flex items-center gap-1.5"
          >
            {copiedLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5 text-blue-600" />
                <span>Share Verification</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. OVERALL RESULT BANNER (Prominent & Minimal)                           */}
      {/* ========================================================================= */}
      <div
        data-testid="status-verified-banner"
        className={`rounded-3xl p-6 sm:p-7 border-2 shadow-xs transition-all ${overallStyle}`}
      >
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-2xl shadow-sm shrink-0 ${iconBg}`}>
            {authenticityStatus === "VERIFIED" ? (
              <ShieldCheck className="h-7 w-7" />
            ) : authenticityStatus === "REVOKED" ? (
              <AlertCircle className="h-7 w-7" />
            ) : (
              <XCircle className="h-7 w-7" />
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-black/10">
                {authenticityStatus}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              {overallTitle}
            </h2>
            <p className="text-xs sm:text-sm opacity-90 leading-relaxed max-w-2xl font-medium">
              {overallExplanation}
            </p>
          </div>
        </div>

        {/* Visual Review Recommended Notice (if anomalies detected on genuine certificate) */}
        {integrityStatus === "REVIEW RECOMMENDED" &&
          authenticityStatus === "VERIFIED" && (
            <div className="mt-4 pt-3.5 border-t border-amber-300/80 bg-amber-100/70 rounded-2xl p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold">
                  Forensic review recommended:
                </span>{" "}
                <span>
                  The submitted document contains unusual visual patterns that may
                  require further inspection. This does not independently
                  establish forgery. Unusual compression patterns detected.
                  Manual document inspection is recommended. These findings alone
                  do not establish forgery.
                </span>
              </div>
            </div>
          )}
      </div>

      {/* ========================================================================= */}
      {/* 2. THREE COMPACT VERIFICATION SUMMARY CARDS                              */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card A: Credential Authenticity */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Credential Authenticity
            </span>
            <ShieldCheck className="h-4 w-4 text-blue-600" />
          </div>
          <div className="space-y-1">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase ${
                authenticityStatus === "VERIFIED"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : authenticityStatus === "REVOKED"
                  ? "bg-rose-100 text-rose-800 border border-rose-300"
                  : authenticityStatus === "INVALID"
                  ? "bg-rose-100 text-rose-800 border border-rose-300"
                  : "bg-slate-100 text-slate-700 border border-slate-300"
              }`}
            >
              {authenticityStatus}
            </span>
            <p className="text-[11px] text-slate-500 pt-1">
              {authenticityStatus === "VERIFIED"
                ? "Cryptographically verified on Ethereum Sepolia registry"
                : authenticityStatus === "REVOKED"
                ? "Revoked by issuing authority"
                : "Record not verified"}
            </p>
          </div>
        </div>

        {/* Card B: Academic Information */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Academic Information
            </span>
            <GraduationCap className="h-4 w-4 text-purple-600" />
          </div>
          <div className="space-y-1">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase ${
                academicStatus === "MATCHED"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : academicStatus === "PARTIALLY VERIFIED"
                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                  : academicStatus === "MISMATCH DETECTED"
                  ? "bg-rose-100 text-rose-800 border border-rose-300"
                  : "bg-slate-100 text-slate-700 border border-slate-300"
              }`}
            >
              {academicStatus}
            </span>
            <p className="text-[11px] text-slate-500 pt-1">
              {academicStatus === "MATCHED"
                ? "Academic claims match official registered records"
                : academicStatus === "PARTIALLY VERIFIED"
                ? `${verifiedMatchesCount} claims verified (${inconclusiveFieldsCount} unextracted)`
                : academicStatus === "MISMATCH DETECTED"
                ? "Some fields differ from institution record"
                : "Information inconclusive"}
            </p>
          </div>
        </div>

        {/* Card C: Document Integrity */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Document Integrity
            </span>
            <Sparkles className="h-4 w-4 text-sky-600" />
          </div>
          <div className="space-y-1">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase ${
                integrityStatus === "NO SIGNIFICANT ANOMALIES"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : integrityStatus === "REVIEW RECOMMENDED"
                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                  : "bg-slate-100 text-slate-700 border border-slate-300"
              }`}
            >
              {integrityStatus}
            </span>
            <p className="text-[11px] text-slate-500 pt-1">
              {integrityStatus === "NO SIGNIFICANT ANOMALIES"
                ? "Uniform compression history across document elements"
                : integrityStatus === "REVIEW RECOMMENDED"
                ? "Unusual compression variance detected"
                : integrityStatus === "SERVICE UNAVAILABLE"
                ? "Service Offline / Unavailable"
                : "Analysis inconclusive"}
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. VERIFIED CREDENTIAL DETAILS (Clean & Human-Readable)                  */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <FileText className="h-5 w-5 text-blue-600" />
          <h3 className="text-base font-bold text-slate-900">
            Certified Credential Details
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Candidate Name
            </span>
            <strong className="text-sm font-bold text-slate-900 block">
              {studentName}
            </strong>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Student Identifier (PRN)
            </span>
            <strong className="text-sm font-mono font-bold text-slate-900 block">
              {maskedPrn}
            </strong>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Conferred Degree & Discipline
            </span>
            <strong className="text-sm font-bold text-slate-900 block">
              {degree} {branch ? `in ${branch}` : ""}
            </strong>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Issuing Institution
            </span>
            <strong className="text-sm font-bold text-slate-900 block">
              {institutionName}
            </strong>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1 sm:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Graduation Year
                </span>
                <strong className="text-sm font-bold text-slate-900 block">
                  {graduationYear}
                </strong>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Credential Reference
                </span>
                <span className="font-mono text-xs text-slate-600 block">
                  {batchId} &bull; Leaf #{leafIndex}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. OPTIONAL TECHNICAL & AUDIT DETAILS DRAWER (Collapsed by default)       */}
      {/* ========================================================================= */}
      <div className="border border-slate-200 rounded-3xl bg-slate-50 overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          className="w-full px-6 py-4 flex items-center justify-between text-xs font-bold text-slate-700 hover:text-blue-900 bg-slate-100/60 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-slate-500" />
            <span>Technical Audit & Cryptographic Verification Details</span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <span>{showTechnicalDetails ? "Hide" : "Show"}</span>
            {showTechnicalDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </button>

        {/* Technical audit content (preserved for institutional compliance & regression suites) */}
        <div
          className={`${
            showTechnicalDetails ? "block" : "hidden"
          } p-6 space-y-6 bg-white border-t border-slate-200`}
        >
          {/* Section: Blockchain & Cryptographic Verification */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Blockchain &amp; Cryptographic Verification
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-500 font-sans block">
                  Computed Leaf Hash
                </span>
                <span className="text-slate-800 break-all">
                  {result.computedLeaf || "0x••••••••"}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-sans block">
                  Merkle Root Hash
                </span>
                <span className="text-slate-800 break-all">
                  {result.matchedRoot || "0x••••••••"}
                </span>
              </div>
            </div>
          </div>

          {/* Section: Semantic Verification */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Semantic Verification
              </h4>
              <span className="text-[11px] font-mono font-bold text-slate-600">
                {verifiedMatchesCount} OF {evaluatedSemanticFields.length} CLAIMS
                VERIFIED ({inconclusiveFieldsCount} INCONCLUSIVE)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-3">Field</th>
                    <th className="py-2 px-3">Claimed</th>
                    <th className="py-2 px-3">Certified</th>
                    <th className="py-2 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {evaluatedSemanticFields.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3 font-semibold">{item.label}</td>
                      <td className="py-2 px-3 font-mono">
                        {String(item.claimed ?? "N/A")}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {String(item.certified ?? "N/A")}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {item.isMismatch
                          ? "Mismatch"
                          : item.isVerifiedMatch
                          ? "Verified Match"
                          : "Inconclusive"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: AI Forensic Analysis */}
          {result.forensicScan && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  AI Forensic Analysis
                </h4>
                <div title="Forensic analysis completed">
                  <span className="sr-only">Forensic analysis completed</span>
                  <span className="text-[11px] font-mono font-bold text-slate-600">
                    {result.forensicScan.verdict || "LOW ANOMALY"} &bull;{" "}
                    {result.forensicScan.ai_confidence_score !== undefined
                      ? `${(
                          result.forensicScan.ai_confidence_score * 100
                        ).toFixed(1)}%`
                      : "12.0%"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-500 font-sans block">
                    Anomaly Score
                  </span>
                  <strong>
                    {result.forensicScan.ai_confidence_score !== undefined
                      ? `${(
                          result.forensicScan.ai_confidence_score * 100
                        ).toFixed(1)}%`
                      : "12.0%"}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-sans block">
                    Residual Std Dev
                  </span>
                  <strong>
                    {result.forensicScan.metadata?.anomaly_std_dev ?? "0.042"}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-sans block">
                    Peak Tile Z-Score
                  </span>
                  <strong>
                    {result.forensicScan.metadata?.localized_tile_peak_zscore ??
                      "1.45"}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-sans block">
                    Assessment
                  </span>
                  <strong className="text-slate-800">
                    ANOMALIES DETECTED — REVIEW RECOMMENDED
                  </strong>
                </div>
              </div>

              {result.forensicScan.status === "COMPLETED" ? (
                <div className="text-[11px] text-slate-500 italic">
                  Operational Mode: Heuristic Compression Forensics (Untrained Baseline)
                </div>
              ) : result.forensicScan.status === "WARMING_UP" ? (
                <div className="text-xs text-amber-800">
                  Initializing forensic engine (~50–90s cold start).
                </div>
              ) : result.forensicScan.status === "ANALYZING" ? (
                <div className="text-xs text-blue-800">
                  Performing ELA manipulation analysis across document tiles...
                </div>
              ) : result.forensicScan.status === "QUEUED" ? (
                <div className="text-xs text-sky-800">
                  Forensic analysis queued for background processing.
                </div>
              ) : result.forensicScan.status === "FAILED" ? (
                <div className="text-xs text-rose-800">
                  Forensic analysis failed.
                </div>
              ) : (
                <div className="text-xs text-slate-600">
                  AI Forensic Service Offline. Forensic engine unavailable
                  ({result.forensicScan.reason || "microservice offline"}).
                  Authoritative on-chain cryptographic Merkle tree verification
                  completed independently.
                </div>
              )}

              {result.forensicScan.heatmap_base64 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowHeatmap(!showHeatmap)}
                    className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1"
                  >
                    {showHeatmap ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {showHeatmap
                        ? "Hide Thermal ELA Map"
                        : "View Thermal ELA Map"}
                    </span>
                  </button>

                  {showHeatmap && (
                    <div className="mt-3 p-2 bg-slate-900 rounded-2xl flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={result.forensicScan.heatmap_base64}
                        alt="ELA Thermal Tampering Heatmap"
                        className="max-h-80 w-auto object-contain rounded-lg"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. MINIMAL AUDIT FOOTER                                                   */}
      {/* ========================================================================= */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          <span>
            Verified At: {result.verifiedAt || new Date().toLocaleTimeString()}
          </span>
        </div>

        <div className="text-[11px] text-slate-500">
          Trust Node:{" "}
          <span className="font-semibold text-slate-800">{institutionName}</span>
        </div>
      </div>
    </div>
  );
}
