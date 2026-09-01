"use client";

import React, { useState } from "react";
import {
  Lock,
  UserCheck,
  Shield,
  Briefcase,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  GraduationCap,
  Award,
  Building2,
  FileCheck2,
  FileSpreadsheet,
  Cpu,
  ArrowRight,
  Fingerprint,
} from "lucide-react";
import { useAuth, DEMO_CREDENTIALS } from "../context/AuthContext";
import { UserRole, DepartmentRole } from "../types/auth";

interface AuthGuardProps {
  requiredRole: UserRole;
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export default function AuthGuard({
  requiredRole,
  children,
}: AuthGuardProps) {
  const { user, isAuthenticated, loginStudent, loginAdmin, loginStaff } = useAuth();

  // Student Form State
  const [studentPrn, setStudentPrn] = useState(DEMO_CREDENTIALS.student.prn);
  const [studentPass, setStudentPass] = useState(DEMO_CREDENTIALS.student.password);

  // Admin Form State
  const [adminId, setAdminId] = useState(DEMO_CREDENTIALS.admin.staffId);
  const [adminPass, setAdminPass] = useState(DEMO_CREDENTIALS.admin.password);

  // Staff Form State
  const [staffId, setStaffId] = useState(DEMO_CREDENTIALS.staff.admissions.staffId);
  const [staffPass, setStaffPass] = useState(DEMO_CREDENTIALS.staff.admissions.password);
  const [staffDept, setStaffDept] = useState<DepartmentRole>("PG_ADMISSIONS_OFFICER");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check if authenticated with required role
  const isAuthorized =
    isAuthenticated &&
    user &&
    (user.role === requiredRole || (user.role === "EXAM_ADMIN" && requiredRole === "UNIVERSITY_STAFF"));

  if (isAuthorized) {
    return <>{children}</>;
  }

  // --- HANDLERS ---
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const res = await loginStudent(studentPrn, studentPass);
    setLoading(false);
    if (!res.success) setErrorMsg(res.error || "Student login failed");
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const res = await loginAdmin(adminId, adminPass);
    setLoading(false);
    if (!res.success) setErrorMsg(res.error || "Admin authentication failed");
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const res = await loginStaff(staffId, staffPass, staffDept);
    setLoading(false);
    if (!res.success) setErrorMsg(res.error || "Staff authentication failed");
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* 1. DISTINCT STUDENT SSO ERP LOGIN GATE */}
      {requiredRole === "STUDENT" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          {/* Top Banner: University Student Identity Header */}
          <div className="bg-gradient-to-r from-blue-700 to-blue-900 p-6 sm:p-8 text-white relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-inner">
                  <GraduationCap className="h-8 w-8 text-blue-200" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest bg-white/20 px-2.5 py-0.5 rounded-full text-blue-100">
                    Student ERP &bull; Academic SSO
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                    Student Degree &amp; Credential Vault
                  </h2>
                </div>
              </div>
              <div className="hidden sm:block text-right">
                <span className="text-xs font-mono font-bold text-blue-200 bg-blue-950/60 px-3 py-1 rounded-lg border border-blue-800">
                  MGMU SSI Gateway
                </span>
              </div>
            </div>
            <p className="text-xs text-blue-100/90 mt-3 max-w-lg leading-relaxed">
              Authenticate with your Permanent Registration Number (PRN) to access offline W3C verifiable credentials, generate selective-disclosure ZK proofs, and bind your MetaMask wallet via EIP-712.
            </p>
          </div>

          {/* Form Body */}
          <form onSubmit={handleStudentLogin} className="p-6 sm:p-8 space-y-5">
            {/* Student ID Card Simulation Box */}
            <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-blue-950">
                <span className="flex items-center gap-1.5">
                  <Fingerprint className="h-4 w-4 text-blue-600" />
                  <span>Student Self-Sovereign Identity Credentials</span>
                </span>
                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                  DPDP Act Compliant
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Permanent Registration No. (PRN):
                  </label>
                  <input
                    type="text"
                    value={studentPrn}
                    onChange={(e) => setStudentPrn(e.target.value.toUpperCase())}
                    required
                    placeholder="PRN20200101"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Student ERP Password / PIN:
                  </label>
                  <input
                    type="password"
                    value={studentPass}
                    onChange={(e) => setStudentPass(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Demo Quick Button */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setStudentPrn(DEMO_CREDENTIALS.student.prn);
                  setStudentPass(DEMO_CREDENTIALS.student.password);
                }}
                className="text-xs text-blue-700 font-bold hover:underline flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Fill Demo Student (Aarav Sharma - PRN20200101)</span>
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50"
            >
              <UserCheck className="h-4 w-4" />
              <span>{loading ? "Authenticating Student SSO..." : "Unlock Student Credential Vault"}</span>
            </button>
          </form>
        </div>
      )}

      {/* 2. DISTINCT EXAM CELL HIGH-SECURITY AUTHORITY GATE */}
      {requiredRole === "EXAM_ADMIN" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          {/* Top Banner: High Security Clearance Header */}
          <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 sm:p-8 text-white relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-inner">
                  <Shield className="h-8 w-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-widest bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2.5 py-0.5 rounded-full">
                      Clearance: Level 4 Top Authority
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                    Examination Cell Authority Console
                  </h2>
                </div>
              </div>
              <div className="hidden sm:block text-right">
                <span className="text-xs font-mono font-bold text-amber-300 bg-black/40 px-3 py-1 rounded-lg border border-amber-400/20">
                  COE-EXAM-MGM
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-300 mt-3 max-w-lg leading-relaxed">
              Restricted to Controller of Examinations and authorized exam registry officials. Access allows anchoring 1,000+ graduation credentials in O(1) Merkle batches and dynamically inverting 256-bit revocation bitmaps on Ethereum Sepolia.
            </p>
          </div>

          {/* Form Body */}
          <form onSubmit={handleAdminLogin} className="p-6 sm:p-8 space-y-5">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="h-4 w-4 text-blue-700" />
                  <span>Authority Authentication Credentials</span>
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-mono font-bold">
                  Sepolia Smart Contract Anchor
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Exam Cell Officer ID:
                  </label>
                  <input
                    type="text"
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value.toUpperCase())}
                    required
                    placeholder="EXAM_ADMIN_MGM"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Master Authority Passkey:
                  </label>
                  <input
                    type="password"
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Quick Fill Button */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setAdminId(DEMO_CREDENTIALS.admin.staffId);
                  setAdminPass(DEMO_CREDENTIALS.admin.password);
                }}
                className="text-xs text-blue-700 font-bold hover:underline flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Fill Controller of Examinations (Prof. V. M. Deshpande)</span>
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-900/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50"
            >
              <Shield className="h-4 w-4 text-amber-400" />
              <span>{loading ? "Verifying Clearance..." : "Authorize & Enter Exam Cell Console"}</span>
            </button>
          </form>
        </div>
      )}

      {/* 3. DISTINCT UNIVERSITY STAFF & DEPARTMENTAL DESK GATE */}
      {requiredRole === "UNIVERSITY_STAFF" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          {/* Top Banner: Department Staff Header */}
          <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950 p-6 sm:p-8 text-white relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-blue-200 shadow-inner">
                  <Building2 className="h-8 w-8" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-800/80 border border-blue-700 px-2.5 py-0.5 rounded-full text-blue-200">
                    Institutional Desk &bull; Multi-Department Terminal
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                    University Verification Suite
                  </h2>
                </div>
              </div>
            </div>
            <p className="text-xs text-blue-100/90 mt-3 max-w-lg leading-relaxed">
              Select your university departmental authority role below to unlock tailored operational verification tools for Post-Graduate Admissions, NEP 2020 Academic Bank of Credits, or Placement T&amp;P Resumes.
            </p>
          </div>

          {/* Form Body */}
          <form onSubmit={handleStaffLogin} className="p-6 sm:p-8 space-y-6">
            {/* Department Selection Cards */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                1. Choose University Department:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Admissions */}
                <div
                  onClick={() => {
                    setStaffDept("PG_ADMISSIONS_OFFICER");
                    setStaffId(DEMO_CREDENTIALS.staff.admissions.staffId);
                  }}
                  className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                    staffDept === "PG_ADMISSIONS_OFFICER"
                      ? "bg-blue-50 border-blue-600 ring-2 ring-blue-500/20 shadow-xs"
                      : "bg-slate-50 border-slate-200 hover:border-blue-300"
                  }`}
                >
                  <GraduationCap className="h-5 w-5 text-blue-600 mb-1.5" />
                  <div className="text-xs font-bold text-slate-900">PG Admissions</div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Prerequisite verification</p>
                </div>

                {/* NEP ABC */}
                <div
                  onClick={() => {
                    setStaffDept("NEP_ABC_COORDINATOR");
                    setStaffId(DEMO_CREDENTIALS.staff.nep.staffId);
                  }}
                  className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                    staffDept === "NEP_ABC_COORDINATOR"
                      ? "bg-purple-50 border-purple-600 ring-2 ring-purple-500/20 shadow-xs"
                      : "bg-slate-50 border-slate-200 hover:border-purple-300"
                  }`}
                >
                  <Sparkles className="h-5 w-5 text-purple-600 mb-1.5" />
                  <div className="text-xs font-bold text-slate-900">NEP 2020 ABC</div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Credit transfer desk</p>
                </div>

                {/* Placement */}
                <div
                  onClick={() => {
                    setStaffDept("PLACEMENT_OFFICER_TNP");
                    setStaffId(DEMO_CREDENTIALS.staff.placement.staffId);
                  }}
                  className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                    staffDept === "PLACEMENT_OFFICER_TNP"
                      ? "bg-emerald-50 border-emerald-600 ring-2 ring-emerald-500/20 shadow-xs"
                      : "bg-slate-50 border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600 mb-1.5" />
                  <div className="text-xs font-bold text-slate-900">Placement T&amp;P</div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Resume audit matrix</p>
                </div>
              </div>
            </div>

            {/* Staff Credentials Box */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-800">
                2. Enter Staff Identification &amp; PIN
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Employee Staff ID:
                  </label>
                  <input
                    type="text"
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                    required
                    placeholder="STAFF_ADM_01"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Staff PIN / Password:
                  </label>
                  <input
                    type="password"
                    value={staffPass}
                    onChange={(e) => setStaffPass(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Quick Demo Button */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  if (staffDept === "PG_ADMISSIONS_OFFICER") setStaffId(DEMO_CREDENTIALS.staff.admissions.staffId);
                  else if (staffDept === "NEP_ABC_COORDINATOR") setStaffId(DEMO_CREDENTIALS.staff.nep.staffId);
                  else setStaffId(DEMO_CREDENTIALS.staff.placement.staffId);
                  setStaffPass("staff123");
                }}
                className="text-xs text-blue-700 font-bold hover:underline flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Fill {staffDept === "PG_ADMISSIONS_OFFICER" ? "Admissions Officer (Dr. Joshi)" : staffDept === "NEP_ABC_COORDINATOR" ? "NEP Coordinator (Prof. Kulkarni)" : "Placement Head (Col. Rathore)"}</span>
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50"
            >
              <Briefcase className="h-4 w-4" />
              <span>{loading ? "Authenticating Department..." : "Unlock Departmental Desk"}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
