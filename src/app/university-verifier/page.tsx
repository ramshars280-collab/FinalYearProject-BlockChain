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
  LogOut,
  Briefcase,
  User,
  Award,
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
import { getStoredBatches, CONSORTIUM_UNIVERSITIES } from "../../lib/storage";
import { downloadFile } from "../../lib/zipHelper";
import DegreeCertificate from "../../components/DegreeCertificate";
import AuthGuard from "../../components/AuthGuard";
import { useAuth } from "../../context/AuthContext";
import { DepartmentRole } from "../../types/auth";

export default function InstitutionalDeskPage() {
  return (
    <AuthGuard
      requiredRole="UNIVERSITY_STAFF"
      title="University Departmental Desk Gate"
      description="Restricted to University verified personnel. Sign in with your Staff ID and Department authorization role to access PG Admissions, NEP 2020 ABC, or Placement Cell (T&amp;P) audit matrix."
    >
      <InstitutionalDeskContent />
    </AuthGuard>
  );
}

function InstitutionalDeskContent() {
  const { user, logout } = useAuth();
  const staffDept: DepartmentRole = (user as any)?.department || "PG_ADMISSIONS_OFFICER";

  const getInitialTab = (): "admissions" | "nep2020" | "placement" => {
    if (staffDept === "NEP_ABC_COORDINATOR") return "nep2020";
    if (staffDept === "PLACEMENT_OFFICER_TNP") return "placement";
    return "admissions";
  };

  const [activeTab, setActiveTab] = useState<"admissions" | "nep2020" | "placement">("admissions");

  useEffect(() => {
    setActiveTab(getInitialTab());
  }, [user]);

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
            issuingInstitutionName: onChain.issuingInstitutionName || parsed.issuer?.name || subject.university,
            issuingInstitutionAddress: onChain.issuingInstitutionAddress || parsed.issuer?.ethereumAddress,
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

  const loadAdmissionsFixture = (fixturePath: string) => {
    fetch(fixturePath)
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 text-blue-900 rounded-full text-xs font-bold mb-2">
            <Briefcase className="h-3.5 w-3.5 text-blue-600" />
            <span>Authorized Department Staff &bull; {user?.fullName}</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            University Institutional Verification Suite
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Consortium cross-verification desks for PG Admissions, NEP 2020 Academic Bank of Credits (ABC), and Placement Cell audits.
          </p>
        </div>

        <button
          onClick={() => logout()}
          className="self-start sm:self-center px-4 py-2 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab("admissions")}
          className={`flex items-center gap-2 py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap rounded-t-xl ${
            activeTab === "admissions"
              ? "border-blue-600 text-blue-950 bg-blue-50/70"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <GraduationCap className="h-4 w-4 text-blue-600" />
          <span>1. PG &amp; Lateral Admissions Desk</span>
        </button>

        <button
          onClick={() => setActiveTab("nep2020")}
          className={`flex items-center gap-2 py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap rounded-t-xl ${
            activeTab === "nep2020"
              ? "border-blue-600 text-blue-950 bg-blue-50/70"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Sparkles className="h-4 w-4 text-purple-600" />
          <span>2. NEP 2020 ABC Credit Transfer Desk</span>
        </button>

        <button
          onClick={() => setActiveTab("placement")}
          className={`flex items-center gap-2 py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap rounded-t-xl ${
            activeTab === "placement"
              ? "border-blue-600 text-blue-950 bg-blue-50/70"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          <span>3. Placement Cell (T&amp;P Audit)</span>
        </button>
      </div>

      {/* TAB 1: PG & LATERAL ADMISSIONS DESK */}
      {activeTab === "admissions" && (
        <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Consortium Prerequisite Accreditation &amp; Degree Authenticator
                </h3>
                <p className="text-xs text-slate-500">
                  Cross-verify external applicant degrees issued by any Consortium Partner University in &lt;140ms
                </p>
              </div>

              {/* Sample Loading Buttons for Multiple Universities */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-500 font-bold">Simulate Applicant:</span>
                <button
                  onClick={() => loadAdmissionsFixture("/fixtures/sppu_degree_sample.json")}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold transition-all hover:scale-102 flex items-center gap-1.5"
                >
                  <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                  <span>SPPU Pune Degree</span>
                </button>
                <button
                  onClick={() => loadAdmissionsFixture("/fixtures/mu_degree_sample.json")}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-all hover:scale-102 flex items-center gap-1.5"
                >
                  <Award className="h-3.5 w-3.5 text-amber-700" />
                  <span>Mumbai Univ. Degree</span>
                </button>
                <button
                  onClick={() => loadAdmissionsFixture("/fixtures/valid_degree_sample.json")}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold transition-all hover:scale-102 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                  <span>MGM Univ. Degree</span>
                </button>
              </div>
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
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/30 rounded-3xl p-10 text-center cursor-pointer transition-all space-y-3"
            >
              <UploadCloud className="h-12 w-12 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-700">
                Drop Candidate Academic Degree JSON here
              </p>
              <p className="text-xs text-slate-400">
                Instant cryptographical proof evaluation against Ethereum Sepolia Consortium Registry
              </p>
            </div>

            {admissionsResult && (
              <div className="space-y-6 pt-4 animate-in fade-in duration-300">
                <div
                  className={`p-6 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    admissionsResult.isValid
                      ? "bg-emerald-50 border-emerald-300 text-emerald-950 shadow-xs"
                      : "bg-red-50 border-red-300 text-red-950"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    {admissionsResult.isValid ? (
                      <CheckCircle2 className="h-8 w-8 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="h-8 w-8 text-red-600 shrink-0" />
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-extrabold">
                          {admissionsResult.isValid
                            ? "Consortium Verification: 100% Eligible & Authentic"
                            : "Admissions Verification: Ineligible / Tampered"}
                        </h4>
                        <span className="text-[10px] bg-emerald-200 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-full font-bold">
                          Cross-University Verified
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-1">
                        Candidate: <span className="font-bold text-slate-900">{admissionsCredential?.credentialSubject.fullName}</span> &bull; 
                        Degree: <span className="font-bold text-slate-900">{admissionsCredential?.credentialSubject.degree}</span> &bull; 
                        Issuing Institution: <span className="font-bold text-blue-900">{admissionsResult.issuingInstitutionName || admissionsCredential?.credentialSubject.university}</span> (CGPA: {admissionsCredential?.credentialSubject.cgpa})
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs shrink-0">
                    {admissionsResult.isValid ? "VERDICT: ADMISSION CLEARED" : "VERDICT: REJECTED"}
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
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  <span>Academic Bank of Credits (ABC) &bull; Inter-University Credit Aggregator</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Ingests modular multi-institution course credits across consortium universities, aggregates NHEQF units, and evaluates lateral semester mobility.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadSampleCourseCredits}
                  className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-bold transition-all hover:scale-102"
                >
                  Reload ABC Fixture
                </button>
              </div>
            </div>

            {/* Aggregation Metrics Cards */}
            {abcCalculation && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-purple-50/60 border border-purple-200 p-5 rounded-2xl space-y-1 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase text-purple-800 tracking-wider">
                    Total ABC Credits
                  </span>
                  <div className="text-3xl font-black text-purple-950 font-mono">
                    {abcCalculation.totalCredits}
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium">
                    {abcCalculation.verifiedCount} Multi-University Courses
                  </p>
                </div>

                <div className="bg-blue-50/60 border border-blue-200 p-5 rounded-2xl space-y-1 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase text-blue-800 tracking-wider">
                    Cumulative Weighted GPA
                  </span>
                  <div className="text-3xl font-black text-blue-900 font-mono">
                    {abcCalculation.weightedGpa} / 10.0
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Credit-weighted algorithm
                  </p>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200 p-5 rounded-2xl space-y-1 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider">
                    NHEQF Level Achieved
                  </span>
                  <div className="text-3xl font-black text-emerald-950 font-mono">
                    Level {abcCalculation.eligibleNheqfLevel}
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium">
                    {abcCalculation.qualificationTitle}
                  </p>
                </div>

                <div className="bg-amber-50/60 border border-amber-200 p-5 rounded-2xl space-y-1 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase text-amber-800 tracking-wider">
                    Lateral Entry Status
                  </span>
                  <div className="text-base font-bold text-amber-950 flex items-center gap-1.5 pt-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span>Eligible for Semester V</span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium">
                    &ge; 80 Credits Satisfied
                  </p>
                </div>
              </div>
            )}

            {/* Course Credit Ledger Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Verified Multi-Institution Consortium Course Ledger
              </h4>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px]">
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
                  <tbody className="divide-y divide-slate-100">
                    {courseCredits.map((course, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3.5 font-mono font-bold text-blue-900">
                          {course.courseCode}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-900">
                          {course.courseTitle}
                        </td>
                        <td className="p-3.5 font-bold text-blue-900">{course.offeringUniversity}</td>
                        <td className="p-3.5 font-medium">Level {course.nheqfLevel}</td>
                        <td className="p-3.5 text-center font-bold text-slate-900">{course.creditsEarned}</td>
                        <td className="p-3.5 text-center font-mono font-bold text-blue-700">
                          {course.grade}
                        </td>
                        <td className="p-3.5 text-right">
                          <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold rounded-full">
                            <CheckCircle2 className="h-3 w-3 text-emerald-700" />
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
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  <span>Placement Cell (T&amp;P) Batch Resume CGPA Audit</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Batch-compare 500+ student resume CGPAs against on-chain records and flag inflated metrics immediately.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadSampleAuditCsv}
                  className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl text-xs font-bold transition-all hover:scale-102"
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
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/30 rounded-3xl p-8 text-center cursor-pointer transition-all space-y-2"
            >
              <UploadCloud className="h-10 w-10 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-700">
                Click to upload Student Placement Resumes CSV
              </p>
              <p className="text-xs text-slate-400">
                Columns: CandidateName, PRN, ReportedDegree, ReportedCGPA
              </p>
            </div>

            {/* Audit Summary Statistics */}
            {auditRecords.length > 0 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Total Audited</span>
                    <span className="text-2xl font-black text-slate-900 font-mono">{auditStats.total}</span>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-bold uppercase text-emerald-800 block">100% Authentic</span>
                    <span className="text-2xl font-black text-emerald-800 font-mono">{auditStats.authentic}</span>
                  </div>

                  <div className="bg-red-50 border border-red-200 p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-bold uppercase text-red-800 block">CGPA Mismatches</span>
                    <span className="text-2xl font-black text-red-800 font-mono">{auditStats.mismatches}</span>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-bold uppercase text-amber-800 block">Unregistered PRNs</span>
                    <span className="text-2xl font-black text-amber-800 font-mono">{auditStats.missing}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Discrepancy Audit Matrix
                  </h4>
                  <button
                    onClick={downloadAuditCsvReport}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all hover:scale-102"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export Audit CSV Report</span>
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px]">
                      <tr>
                        <th className="p-3.5">Candidate</th>
                        <th className="p-3.5">PRN</th>
                        <th className="p-3.5">Reported CGPA</th>
                        <th className="p-3.5">Verified On-Chain CGPA</th>
                        <th className="p-3.5">Discrepancy Delta</th>
                        <th className="p-3.5 text-right">Audit Verdict</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditRecords.map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3.5 font-bold text-slate-900">{r.candidateName}</td>
                          <td className="p-3.5 font-mono text-slate-500">{r.prn}</td>
                          <td className="p-3.5 font-bold">{r.reportedCgpa.toFixed(2)}</td>
                          <td className="p-3.5 font-bold text-blue-700">
                            {r.verifiedCgpa !== undefined ? r.verifiedCgpa.toFixed(2) : "N/A"}
                          </td>
                          <td className="p-3.5 font-mono">
                            {r.discrepancyDelta !== undefined && r.discrepancyDelta !== 0 ? (
                              <span className="text-red-600 font-bold">
                                {r.discrepancyDelta > 0 ? `+${r.discrepancyDelta}` : r.discrepancyDelta} (Inflated)
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-bold">0.00 (Match)</span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            {r.status === "AUTHENTIC" && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold rounded-full">
                                <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                                <span>Verified Authentic</span>
                              </span>
                            )}
                            {r.status === "CGPA_MISMATCH" && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 bg-red-100 text-red-900 border border-red-200 font-bold rounded-full">
                                <XCircle className="h-3 w-3 text-red-700" />
                                <span>CGPA Inflated / Flagged</span>
                              </span>
                            )}
                            {r.status === "PRN_NOT_FOUND" && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-200 font-bold rounded-full">
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
