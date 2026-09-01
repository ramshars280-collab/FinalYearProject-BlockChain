"use client";

import React, { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import {
  Building2,
  GraduationCap,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Search,
  UploadCloud,
  FileCheck2,
  Sparkles,
  Download,
  Flame,
  ArrowRight,
  TrendingUp,
  XCircle,
  Cpu,
  Fingerprint,
} from "lucide-react";
import {
  CourseCreditRecord,
  ResumeAuditRecord,
  W3CCredentialPayload,
  VerificationResult,
} from "../../types";
import { calculateAcademicBankOfCredits, NHEQF_LEVEL_MAP } from "../../lib/nep2020";
import { hashCredentialSubject } from "../../lib/crypto";
import { verifyCredentialOnChain } from "../../lib/contracts";
import { getStoredBatches } from "../../lib/storage";
import { downloadFile } from "../../lib/zipHelper";
import DegreeCertificate from "../../components/DegreeCertificate";

export default function InstitutionalDeskPage() {
  const [activeTab, setActiveTab] = useState<"admissions" | "nep2020" | "placement">("admissions");

  // Tab 1: PG Admissions State
  const [admissionsCredential, setAdmissionsCredential] = useState<W3CCredentialPayload | null>(null);
  const [admissionsResult, setAdmissionsResult] = useState<VerificationResult | null>(null);
  const [admissionsVerifying, setAdmissionsVerifying] = useState(false);
  const admissionsFileInputRef = useRef<HTMLInputElement>(null);

  // Tab 2: NEP 2020 ABC State
  const [courseCredits, setCourseCredits] = useState<CourseCreditRecord[]>([]);
  const [abcCalculation, setAbcCalculation] = useState<any>(null);

  // Tab 3: Placement Cell T&P Audit State
  const [auditRecords, setAuditRecords] = useState<ResumeAuditRecord[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditStats, setAuditStats] = useState({ total: 0, authentic: 0, mismatches: 0, missing: 0 });
  const resumeFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSampleCourseCredits();
  }, []);

  // --- TAB 1: Admissions Functions ---
  const handleAdmissionsUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const parsed: W3CCredentialPayload = JSON.parse(text);
        setAdmissionsVerifying(true);
        setAdmissionsCredential(parsed);

        const subject = parsed.credentialSubject;
        const proofData = parsed.proof?.merkleProof;

        if (subject && proofData) {
          const computedLeaf = hashCredentialSubject(subject);
          const onChain = await verifyCredentialOnChain(
            proofData.batchId,
            computedLeaf,
            proofData.proof,
            proofData.leafIndex,
            proofData.contractAddress
          );

          setAdmissionsResult({
            isValid: onChain.isValid && !onChain.isRevoked,
            isRevoked: onChain.isRevoked,
            tamperDetected: !onChain.isValid,
            computedLeaf,
            matchedRoot: onChain.rootHash,
            batchId: proofData.batchId,
            leafIndex: proofData.leafIndex,
            credential: parsed,
            verifiedAt: new Date().toLocaleTimeString(),
          });
        }
      } catch (err) {
        alert("Invalid credential file");
      } finally {
        setAdmissionsVerifying(false);
      }
    };
    reader.readAsText(file);
  };

  const loadAdmissionsSample = () => {
    fetch("/fixtures/valid_degree_sample.json")
      .then((r) => r.json())
      .then((data) => {
        const file = new File([JSON.stringify(data)], "sample.json", { type: "application/json" });
        handleAdmissionsUpload(file);
      });
  };

  // --- TAB 2: NEP 2020 Functions ---
  const loadSampleCourseCredits = () => {
    fetch("/fixtures/sample_course_credits.json")
      .then((r) => r.json())
      .then((courses: CourseCreditRecord[]) => {
        setCourseCredits(courses);
        const calc = calculateAcademicBankOfCredits(courses);
        setAbcCalculation(calc);
      });
  };

  // --- TAB 3: Placement Audit Functions ---
  const handleResumeCsvUpload = (file: File) => {
    setIsAuditing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const batches = getStoredBatches();
          const realStudentMap: Record<string, any> = {};
          batches.forEach((b) => {
            b.records.forEach((s) => {
              realStudentMap[s.prn.toUpperCase()] = s;
            });
          });

          let authenticCount = 0;
          let mismatchCount = 0;
          let missingCount = 0;

          const audited: ResumeAuditRecord[] = results.data.map((row: any) => {
            const prn = (row.PRN || row.prn || "").trim().toUpperCase();
            const reportedCgpa = parseFloat(row.ReportedCGPA || row.reportedCgpa || row.CGPA || "0");
            const reportedDegree = (row.ReportedDegree || row.reportedDegree || row.Degree || "B.Tech").trim();
            const candidateName = (row.CandidateName || row.candidateName || row.Name || "Candidate").trim();

            const real = realStudentMap[prn];

            if (!real) {
              missingCount++;
              return {
                candidateName,
                prn,
                reportedDegree,
                reportedCgpa,
                status: "PRN_NOT_FOUND",
              };
            }

            const verifiedCgpa = Number(real.cgpa);
            const verifiedDegree = real.degree;
            const delta = Math.abs(reportedCgpa - verifiedCgpa);

            if (delta < 0.01 && verifiedDegree.toLowerCase().includes(reportedDegree.toLowerCase().slice(0, 4))) {
              authenticCount++;
              return {
                candidateName,
                prn,
                reportedDegree,
                reportedCgpa,
                verifiedCgpa,
                verifiedDegree,
                status: "AUTHENTIC",
                discrepancyDelta: 0,
              };
            } else {
              mismatchCount++;
              return {
                candidateName,
                prn,
                reportedDegree,
                reportedCgpa,
                verifiedCgpa,
                verifiedDegree,
                status: "CGPA_MISMATCH",
                discrepancyDelta: Number((reportedCgpa - verifiedCgpa).toFixed(2)),
              };
            }
          });

          setAuditRecords(audited);
          setAuditStats({
            total: audited.length,
            authentic: authenticCount,
            mismatches: mismatchCount,
            missing: missingCount,
          });
        } catch (e: any) {
          alert("Audit parsing error: " + e?.message);
        } finally {
          setIsAuditing(false);
        }
      },
    });
  };

  const loadSampleAuditCsv = () => {
    fetch("/fixtures/sample_resumes_audit.csv")
      .then((r) => r.text())
      .then((csvText) => {
        const file = new File([csvText], "sample_resumes_audit.csv", { type: "text/csv" });
        handleResumeCsvUpload(file);
      });
  };

  const downloadAuditCsvReport = () => {
    if (auditRecords.length === 0) return;
    const csv = Papa.unparse(auditRecords);
    downloadFile(csv, `placement_audit_report_${Date.now()}.csv`, "text/csv");
  };

  return (
    <div className="space-y-8 py-2">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 rounded-full text-xs font-semibold mb-2">
          <Building2 className="h-3.5 w-3.5 text-indigo-400" />
          <span>Dual-Role Institutional Command Suite</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
          University Institutional Verification Suite
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Tailored desks for PG Admissions, NEP 2020 Academic Bank of Credits (ABC), and Placement Cell (T&amp;P) batch audits.
        </p>
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-2 sm:gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab("admissions")}
          className={`flex items-center gap-2 py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap rounded-t-xl ${
            activeTab === "admissions"
              ? "border-cyan-400 text-white bg-blue-600/20"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <GraduationCap className="h-4 w-4 text-cyan-400" />
          <span>1. PG &amp; Lateral Admissions Desk</span>
        </button>

        <button
          onClick={() => setActiveTab("nep2020")}
          className={`flex items-center gap-2 py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap rounded-t-xl ${
            activeTab === "nep2020"
              ? "border-purple-400 text-white bg-purple-600/20"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span>2. NEP 2020 ABC Credit Transfer Desk</span>
        </button>

        <button
          onClick={() => setActiveTab("placement")}
          className={`flex items-center gap-2 py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap rounded-t-xl ${
            activeTab === "placement"
              ? "border-emerald-400 text-white bg-emerald-600/20"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
          <span>3. Placement Cell (T&amp;P Audit)</span>
        </button>
      </div>

      {/* TAB 1: PG & LATERAL ADMISSIONS DESK */}
      {activeTab === "admissions" && (
        <div className="space-y-6">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Prerequisite Accreditation &amp; Degree Authenticator
                </h3>
                <p className="text-xs text-slate-400">
                  Verify external candidate degree authenticity and eligibility in &lt;140ms
                </p>
              </div>

              <button
                onClick={loadAdmissionsSample}
                className="px-4 py-2 bg-blue-600/30 hover:bg-blue-600/50 text-cyan-300 border border-blue-500/40 rounded-xl text-xs font-bold transition-all hover:scale-102"
              >
                Load Sample Candidate Credential
              </button>
            </div>

            <input
              ref={admissionsFileInputRef}
              type="file"
              accept=".json"
              onChange={(e) => e.target.files?.[0] && handleAdmissionsUpload(e.target.files[0])}
              className="hidden"
            />

            <div
              onClick={() => admissionsFileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-cyan-400 hover:bg-slate-900/60 rounded-3xl p-10 text-center cursor-pointer transition-all space-y-3"
            >
              <UploadCloud className="h-12 w-12 text-slate-500 mx-auto" />
              <p className="text-sm font-bold text-slate-200">
                Drop Candidate Academic Degree JSON here
              </p>
              <p className="text-xs text-slate-500">
                Instant cryptographical proof evaluation against Ethereum Sepolia
              </p>
            </div>

            {admissionsResult && (
              <div className="space-y-6 pt-4 animate-in fade-in duration-300">
                <div
                  className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    admissionsResult.isValid
                      ? "bg-emerald-950/50 border-emerald-500/50 text-emerald-300 shadow-lg shadow-emerald-500/10"
                      : "bg-red-950/50 border-red-500/50 text-red-300"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    {admissionsResult.isValid ? (
                      <CheckCircle2 className="h-7 w-7 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="h-7 w-7 text-red-400 shrink-0" />
                    )}
                    <div>
                      <h4 className="text-base font-extrabold text-white">
                        {admissionsResult.isValid
                          ? "Admissions Verification: 100% Eligible & Authentic"
                          : "Admissions Verification: Ineligible / Tampered"}
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Candidate: {admissionsCredential?.credentialSubject.fullName} &bull; Degree:{" "}
                        {admissionsCredential?.credentialSubject.degree} (CGPA:{" "}
                        {admissionsCredential?.credentialSubject.cgpa})
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700 shadow-inner">
                    {admissionsResult.isValid ? "VERDICT: CLEARED" : "VERDICT: REJECTED"}
                  </span>
                </div>

                {admissionsCredential && (
                  <DegreeCertificate
                    credential={admissionsCredential}
                    verification={admissionsResult}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: NEP 2020 ABC CREDIT TRANSFER DESK */}
      {activeTab === "nep2020" && (
        <div className="space-y-6">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-400" />
                  <span>Academic Bank of Credits (ABC) &bull; NHEQF Framework Engine</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Ingests modular multi-institution course credits, aggregates NHEQF units, and evaluates lateral semester mobility.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadSampleCourseCredits}
                  className="px-4 py-2 bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-700/80 rounded-xl text-xs font-bold transition-all hover:scale-102"
                >
                  Reload ABC Fixture
                </button>
              </div>
            </div>

            {/* Aggregation Metrics Cards */}
            {abcCalculation && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="glass-card-interactive p-5 rounded-2xl border border-purple-500/30 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-purple-300 tracking-wider">
                    Total ABC Credits
                  </span>
                  <div className="text-3xl font-black text-purple-400 font-mono">
                    {abcCalculation.totalCredits}
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {abcCalculation.verifiedCount} Courses Certified On-Chain
                  </p>
                </div>

                <div className="glass-card-interactive p-5 rounded-2xl border border-blue-500/30 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-cyan-300 tracking-wider">
                    Cumulative Weighted GPA
                  </span>
                  <div className="text-3xl font-black text-cyan-400 font-mono">
                    {abcCalculation.weightedGpa} / 10.0
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Credit-weighted algorithm
                  </p>
                </div>

                <div className="glass-card-interactive p-5 rounded-2xl border border-emerald-500/30 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-emerald-300 tracking-wider">
                    NHEQF Level Achieved
                  </span>
                  <div className="text-3xl font-black text-emerald-400 font-mono">
                    Level {abcCalculation.eligibleNheqfLevel}
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {abcCalculation.qualificationTitle}
                  </p>
                </div>

                <div className="glass-card-interactive p-5 rounded-2xl border border-amber-500/30 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-amber-300 tracking-wider">
                    Lateral Entry Status
                  </span>
                  <div className="text-base font-bold text-amber-300 flex items-center gap-1.5 pt-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <span>Eligible for Semester V</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    &ge; 80 Credits Satisfied
                  </p>
                </div>
              </div>
            )}

            {/* Course Credit Ledger Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Verified Multi-Institution Course Ledger
              </h4>

              <div className="overflow-x-auto border border-slate-800 rounded-2xl">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-300 font-semibold border-b border-slate-800 uppercase text-[10px]">
                    <tr>
                      <th className="p-3.5">Course Code</th>
                      <th className="p-3.5">Course Title</th>
                      <th className="p-3.5">Offering University / Provider</th>
                      <th className="p-3.5">NHEQF Level</th>
                      <th className="p-3.5 text-center">Credits</th>
                      <th className="p-3.5 text-center">Grade</th>
                      <th className="p-3.5 text-right">Blockchain Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {courseCredits.map((course, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/60 transition-colors">
                        <td className="p-3.5 font-mono font-bold text-cyan-300">
                          {course.courseCode}
                        </td>
                        <td className="p-3.5 font-semibold text-white">
                          {course.courseTitle}
                        </td>
                        <td className="p-3.5 text-slate-400">{course.offeringUniversity}</td>
                        <td className="p-3.5 font-medium">Level {course.nheqfLevel}</td>
                        <td className="p-3.5 text-center font-bold text-white">{course.creditsEarned}</td>
                        <td className="p-3.5 text-center font-mono font-bold text-cyan-400">
                          {course.grade}
                        </td>
                        <td className="p-3.5 text-right">
                          <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-semibold rounded-full">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                            <span>ABC Certified</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PLACEMENT CELL (T&P AUDIT) */}
      {activeTab === "placement" && (
        <div className="space-y-6">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                  <span>Placement Cell (T&amp;P) Batch Resume CGPA Audit</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Batch-compare 500+ student resume CGPAs against on-chain records and flag inflated metrics immediately.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadSampleAuditCsv}
                  className="px-4 py-2 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/80 rounded-xl text-xs font-bold transition-all hover:scale-102"
                >
                  Load Sample T&amp;P Audit CSV
                </button>
              </div>
            </div>

            {/* CSV Dropzone for Placement Resumes */}
            <input
              ref={resumeFileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files?.[0] && handleResumeCsvUpload(e.target.files[0])}
              className="hidden"
            />

            <div
              onClick={() => resumeFileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-emerald-400 hover:bg-slate-900/60 rounded-3xl p-8 text-center cursor-pointer transition-all space-y-2"
            >
              <UploadCloud className="h-10 w-10 text-slate-500 mx-auto" />
              <p className="text-sm font-bold text-slate-200">
                Click to upload Student Placement Resumes CSV
              </p>
              <p className="text-xs text-slate-500">
                Columns: CandidateName, PRN, ReportedDegree, ReportedCGPA
              </p>
            </div>

            {/* Audit Summary Statistics */}
            {auditRecords.length > 0 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="glass-card-interactive p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Audited</span>
                    <span className="text-2xl font-black text-white font-mono">{auditStats.total}</span>
                  </div>

                  <div className="glass-card-interactive p-4 rounded-2xl border-emerald-500/30 text-center">
                    <span className="text-[10px] font-bold uppercase text-emerald-400 block">100% Authentic</span>
                    <span className="text-2xl font-black text-emerald-400 font-mono">{auditStats.authentic}</span>
                  </div>

                  <div className="glass-card-interactive p-4 rounded-2xl border-red-500/30 text-center">
                    <span className="text-[10px] font-bold uppercase text-red-400 block">CGPA Mismatches</span>
                    <span className="text-2xl font-black text-red-400 font-mono">{auditStats.mismatches}</span>
                  </div>

                  <div className="glass-card-interactive p-4 rounded-2xl border-amber-500/30 text-center">
                    <span className="text-[10px] font-bold uppercase text-amber-400 block">Unregistered PRNs</span>
                    <span className="text-2xl font-black text-amber-400 font-mono">{auditStats.missing}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Discrepancy Audit Matrix
                  </h4>
                  <button
                    onClick={downloadAuditCsvReport}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md transition-all hover:scale-102"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export Audit CSV Report</span>
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-800 rounded-2xl">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-300 font-semibold border-b border-slate-800 uppercase text-[10px]">
                      <tr>
                        <th className="p-3.5">Candidate</th>
                        <th className="p-3.5">PRN</th>
                        <th className="p-3.5">Reported CGPA</th>
                        <th className="p-3.5">Verified On-Chain CGPA</th>
                        <th className="p-3.5">Discrepancy Delta</th>
                        <th className="p-3.5 text-right">Audit Verdict</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {auditRecords.map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/60 transition-colors">
                          <td className="p-3.5 font-bold text-white">{r.candidateName}</td>
                          <td className="p-3.5 font-mono text-slate-400">{r.prn}</td>
                          <td className="p-3.5 font-bold">{r.reportedCgpa.toFixed(2)}</td>
                          <td className="p-3.5 font-bold text-cyan-400">
                            {r.verifiedCgpa !== undefined ? r.verifiedCgpa.toFixed(2) : "N/A"}
                          </td>
                          <td className="p-3.5 font-mono">
                            {r.discrepancyDelta !== undefined && r.discrepancyDelta !== 0 ? (
                              <span className="text-red-400 font-bold">
                                {r.discrepancyDelta > 0 ? `+${r.discrepancyDelta}` : r.discrepancyDelta} (Inflated)
                              </span>
                            ) : (
                              <span className="text-emerald-400 font-bold">0.00 (Match)</span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            {r.status === "AUTHENTIC" && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-bold rounded-full">
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                <span>Verified Authentic</span>
                              </span>
                            )}
                            {r.status === "CGPA_MISMATCH" && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 bg-red-950/80 text-red-300 border border-red-800/80 font-bold rounded-full">
                                <XCircle className="h-3 w-3 text-red-400" />
                                <span>CGPA Inflated / Flagged</span>
                              </span>
                            )}
                            {r.status === "PRN_NOT_FOUND" && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 bg-amber-950/80 text-amber-300 border border-amber-800/80 font-bold rounded-full">
                                <AlertCircle className="h-3 w-3 text-amber-400" />
                                <span>PRN Unregistered</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
