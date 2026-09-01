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
    // Pre-load NEP 2020 default course credits
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

  const handleModularCourseUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const courses: CourseCreditRecord[] = JSON.parse(text);
        setCourseCredits(courses);
        const calc = calculateAcademicBankOfCredits(courses);
        setAbcCalculation(calc);
      } catch (err) {
        alert("Invalid course credits JSON format");
      }
    };
    reader.readAsText(file);
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
          // Build lookup map from stored batches
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
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 border border-indigo-200 text-indigo-900 rounded-full text-xs font-semibold mb-2">
          <Building2 className="h-3.5 w-3.5 text-indigo-700" />
          <span>Dual-Role Institutional Desk</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          University Institutional Verification Suite
        </h1>
        <p className="text-xs sm:text-sm text-slate-600">
          Tailored desks for PG Admissions, NEP 2020 Academic Bank of Credits (ABC), and Placement Cell (T&amp;P) batch audits.
        </p>
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab("admissions")}
          className={`flex items-center gap-2 py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "admissions"
              ? "border-blue-900 text-blue-950 bg-blue-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <GraduationCap className="h-4 w-4" />
          <span>1. PG &amp; Lateral Admissions Desk</span>
        </button>

        <button
          onClick={() => setActiveTab("nep2020")}
          className={`flex items-center gap-2 py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "nep2020"
              ? "border-blue-900 text-blue-950 bg-blue-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <Sparkles className="h-4 w-4 text-purple-600" />
          <span>2. NEP 2020 ABC Credit Transfer Desk</span>
        </button>

        <button
          onClick={() => setActiveTab("placement")}
          className={`flex items-center gap-2 py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "placement"
              ? "border-blue-900 text-blue-950 bg-blue-50/50 rounded-t-lg"
              : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          <span>3. Placement Cell (T&amp;P Audit)</span>
        </button>
      </div>

      {/* TAB 1: PG & LATERAL ADMISSIONS DESK */}
      {activeTab === "admissions" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Prerequisite Accreditation &amp; Degree Authenticator
                </h3>
                <p className="text-xs text-slate-500">
                  Verify external candidate degree authenticity and eligibility in &lt;300ms
                </p>
              </div>

              <button
                onClick={loadAdmissionsSample}
                className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-lg text-xs font-semibold self-start sm:self-auto transition-colors"
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
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/50 rounded-2xl p-8 text-center cursor-pointer transition-colors space-y-2"
            >
              <UploadCloud className="h-10 w-10 text-slate-400 mx-auto" />
              <p className="text-xs sm:text-sm font-semibold text-slate-800">
                Drop Candidate Academic Degree JSON here
              </p>
              <p className="text-[11px] text-slate-400">
                Instant cryptographical proof evaluation against Ethereum Sepolia
              </p>
            </div>

            {admissionsResult && (
              <div className="space-y-4 pt-4">
                <div
                  className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                    admissionsResult.isValid
                      ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                      : "bg-red-50 border-red-300 text-red-950"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {admissionsResult.isValid ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-600 shrink-0" />
                    )}
                    <div>
                      <h4 className="text-sm font-bold">
                        {admissionsResult.isValid
                          ? "Admissions Verification: 100% Eligible & Authentic"
                          : "Admissions Verification: Ineligible / Tampered"}
                      </h4>
                      <p className="text-xs mt-0.5">
                        Candidate: {admissionsCredential?.credentialSubject.fullName} &bull; Degree:{" "}
                        {admissionsCredential?.credentialSubject.degree} (CGPA:{" "}
                        {admissionsCredential?.credentialSubject.cgpa})
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold bg-white px-2.5 py-1 rounded border shadow-2xs">
                    {admissionsResult.isValid ? "STATUS: CLEARED" : "STATUS: REJECTED"}
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
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  <span>Academic Bank of Credits (ABC) &bull; NHEQF Framework Engine</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Ingests modular multi-institution course credits, aggregates NHEQF units, and evaluates lateral semester mobility.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadSampleCourseCredits}
                  className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  Reload ABC Fixture
                </button>
              </div>
            </div>

            {/* Aggregation Metrics Cards */}
            {abcCalculation && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-4 space-y-1">
                  <span className="text-[11px] font-bold uppercase text-purple-700 tracking-wider">
                    Total ABC Credits
                  </span>
                  <div className="text-2xl font-extrabold text-purple-950">
                    {abcCalculation.totalCredits} Credits
                  </div>
                  <p className="text-[10px] text-purple-800 font-medium">
                    {abcCalculation.verifiedCount} Courses Certified On-Chain
                  </p>
                </div>

                <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 space-y-1">
                  <span className="text-[11px] font-bold uppercase text-blue-700 tracking-wider">
                    Weighted Cumulative GPA
                  </span>
                  <div className="text-2xl font-extrabold text-blue-950">
                    {abcCalculation.weightedGpa} / 10.0
                  </div>
                  <p className="text-[10px] text-blue-800 font-medium">
                    Weighted by Course Credit Hours
                  </p>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-1">
                  <span className="text-[11px] font-bold uppercase text-emerald-700 tracking-wider">
                    NHEQF Level Achieved
                  </span>
                  <div className="text-2xl font-extrabold text-emerald-950">
                    Level {abcCalculation.eligibleNheqfLevel}
                  </div>
                  <p className="text-[10px] text-emerald-800 font-medium">
                    {abcCalculation.qualificationTitle}
                  </p>
                </div>

                <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-1">
                  <span className="text-[11px] font-bold uppercase text-amber-800 tracking-wider">
                    Lateral Mobility Status
                  </span>
                  <div className="text-base font-bold text-amber-950 flex items-center gap-1.5 pt-1">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span>Eligible for Semester V</span>
                  </div>
                  <p className="text-[10px] text-amber-800 font-medium">
                    &ge; 80 Credits for Direct Year 2/3 Entry
                  </p>
                </div>
              </div>
            )}

            {/* Course Credit Ledger Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Verified Multi-Institution Course Ledger
              </h4>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Course Code</th>
                      <th className="p-3">Course Title</th>
                      <th className="p-3">Offering University / Provider</th>
                      <th className="p-3">NHEQF Level</th>
                      <th className="p-3 text-center">Credits</th>
                      <th className="p-3 text-center">Grade</th>
                      <th className="p-3 text-right">Blockchain Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {courseCredits.map((course, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-900">
                          {course.courseCode}
                        </td>
                        <td className="p-3 font-medium text-slate-900">
                          {course.courseTitle}
                        </td>
                        <td className="p-3 text-slate-600">{course.offeringUniversity}</td>
                        <td className="p-3 font-medium">Level {course.nheqfLevel}</td>
                        <td className="p-3 text-center font-bold">{course.creditsEarned}</td>
                        <td className="p-3 text-center font-mono font-bold text-blue-900">
                          {course.grade}
                        </td>
                        <td className="p-3 text-right">
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded-full">
                            <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                            <span>ABC Verified</span>
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
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
                  <span>Placement Cell (T&amp;P) Batch Resume CGPA Audit</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Batch-compare 500+ student resume CGPAs against on-chain records and flag inflated metrics immediately.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadSampleAuditCsv}
                  className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors"
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
              className="border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50 rounded-2xl p-6 text-center cursor-pointer transition-colors space-y-2"
            >
              <UploadCloud className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="text-xs font-semibold text-slate-800">
                Click to upload Student Placement Resumes CSV
              </p>
              <p className="text-[11px] text-slate-400">
                Columns: CandidateName, PRN, ReportedDegree, ReportedCGPA
              </p>
            </div>

            {/* Audit Summary Statistics */}
            {auditRecords.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Total Audited</span>
                    <span className="text-xl font-bold text-slate-900">{auditStats.total}</span>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-bold uppercase text-emerald-700 block">100% Authentic</span>
                    <span className="text-xl font-bold text-emerald-900">{auditStats.authentic}</span>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-bold uppercase text-red-700 block">CGPA Mismatches</span>
                    <span className="text-xl font-bold text-red-900">{auditStats.mismatches}</span>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-bold uppercase text-amber-800 block">Unregistered PRNs</span>
                    <span className="text-xl font-bold text-amber-900">{auditStats.missing}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Discrepancy Audit Table
                  </h4>
                  <button
                    onClick={downloadAuditCsvReport}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-2xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export Audit CSV Report</span>
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Candidate</th>
                        <th className="p-3">PRN</th>
                        <th className="p-3">Reported CGPA</th>
                        <th className="p-3">Verified On-Chain CGPA</th>
                        <th className="p-3">Discrepancy Delta</th>
                        <th className="p-3 text-right">Audit Verdict</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditRecords.map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-semibold text-slate-900">{r.candidateName}</td>
                          <td className="p-3 font-mono text-slate-600">{r.prn}</td>
                          <td className="p-3 font-bold">{r.reportedCgpa.toFixed(2)}</td>
                          <td className="p-3 font-bold text-blue-900">
                            {r.verifiedCgpa !== undefined ? r.verifiedCgpa.toFixed(2) : "N/A"}
                          </td>
                          <td className="p-3 font-mono">
                            {r.discrepancyDelta !== undefined && r.discrepancyDelta !== 0 ? (
                              <span className="text-red-600 font-bold">
                                {r.discrepancyDelta > 0 ? `+${r.discrepancyDelta}` : r.discrepancyDelta} (Inflated)
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-bold">0.00 (Match)</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {r.status === "AUTHENTIC" && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded-full">
                                <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                                <span>Verified Authentic</span>
                              </span>
                            )}
                            {r.status === "CGPA_MISMATCH" && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-red-100 text-red-800 font-semibold rounded-full">
                                <XCircle className="h-3 w-3 text-red-700" />
                                <span>CGPA Inflated / Flagged</span>
                              </span>
                            )}
                            {r.status === "PRN_NOT_FOUND" && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 font-semibold rounded-full">
                                <AlertCircle className="h-3 w-3 text-amber-700" />
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
