"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  GraduationCap,
  Shield,
  Briefcase,
  UserCheck,
  KeyRound,
  Fingerprint,
  Sparkles,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";
import { useAuth, DEMO_CREDENTIALS } from "../../context/AuthContext";
import { UserRole, DepartmentRole } from "../../types/auth";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm font-bold text-slate-500">Loading Portal Login...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, loginStudent, loginAdmin, loginStaff } = useAuth();

  const redirectUrl = searchParams.get("redirect");
  const initialRoleParam = searchParams.get("role") as UserRole | null;

  const [activeTab, setActiveTab] = useState<UserRole>(initialRoleParam || "STUDENT");

  // Student Form
  const [studentPrn, setStudentPrn] = useState(DEMO_CREDENTIALS.student.prn);
  const [studentPass, setStudentPass] = useState(DEMO_CREDENTIALS.student.password);

  // Admin Form
  const [adminId, setAdminId] = useState(DEMO_CREDENTIALS.admin.staffId);
  const [adminPass, setAdminPass] = useState(DEMO_CREDENTIALS.admin.password);

  // Staff Form
  const [staffId, setStaffId] = useState(DEMO_CREDENTIALS.staff.admissions.staffId);
  const [staffPass, setStaffPass] = useState(DEMO_CREDENTIALS.staff.admissions.password);
  const [staffDept, setStaffDept] = useState<DepartmentRole>("PG_ADMISSIONS_OFFICER");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If already authenticated, redirect to appropriate destination
  useEffect(() => {
    if (isAuthenticated && user) {
      if (redirectUrl) {
        router.push(redirectUrl);
      } else if (user.role === "STUDENT") {
        router.push("/student");
      } else if (user.role === "EXAM_ADMIN") {
        router.push("/issuer");
      } else if (user.role === "UNIVERSITY_STAFF") {
        router.push("/university-verifier");
      }
    }
  }, [isAuthenticated, user, redirectUrl, router]);

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const res = await loginStudent(studentPrn, studentPass);
    setLoading(false);
    if (res.success) {
      router.push(redirectUrl || "/student");
    } else {
      setErrorMsg(res.error || "Student login failed");
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const res = await loginAdmin(adminId, adminPass);
    setLoading(false);
    if (res.success) {
      router.push(redirectUrl || "/issuer");
    } else {
      setErrorMsg(res.error || "Admin login failed");
    }
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const res = await loginStaff(staffId, staffPass, staffDept);
    setLoading(false);
    if (res.success) {
      router.push(redirectUrl || "/university-verifier");
    } else {
      setErrorMsg(res.error || "Staff login failed");
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 sm:py-12 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-blue-50 border border-blue-200 text-blue-900 rounded-full text-xs font-bold">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
          <span>Role-Based Access Control Gate</span>
        </div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Portal Sign In
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Select your institutional role to securely access your dedicated workspace
        </p>
      </div>

      {/* Main Login Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Role Tabs Header */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50/80 p-1.5 gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab("STUDENT");
              setErrorMsg(null);
            }}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl text-xs font-bold transition-all ${
              activeTab === "STUDENT"
                ? "bg-white text-blue-900 shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-blue-900 hover:bg-slate-100"
            }`}
          >
            <GraduationCap className={`h-4 w-4 ${activeTab === "STUDENT" ? "text-blue-600" : "text-slate-400"}`} />
            <span>Student SSO</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("EXAM_ADMIN");
              setErrorMsg(null);
            }}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl text-xs font-bold transition-all ${
              activeTab === "EXAM_ADMIN"
                ? "bg-white text-amber-900 shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-amber-900 hover:bg-slate-100"
            }`}
          >
            <Shield className={`h-4 w-4 ${activeTab === "EXAM_ADMIN" ? "text-amber-700" : "text-slate-400"}`} />
            <span>Exam Cell</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("UNIVERSITY_STAFF");
              setErrorMsg(null);
            }}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl text-xs font-bold transition-all ${
              activeTab === "UNIVERSITY_STAFF"
                ? "bg-white text-blue-900 shadow-sm border border-slate-200"
                : "text-slate-600 hover:text-blue-900 hover:bg-slate-100"
            }`}
          >
            <Briefcase className={`h-4 w-4 ${activeTab === "UNIVERSITY_STAFF" ? "text-blue-600" : "text-slate-400"}`} />
            <span>Institutional Desk</span>
          </button>
        </div>

        {/* TAB 1: STUDENT SSO LOGIN */}
        {activeTab === "STUDENT" && (
          <form onSubmit={handleStudentSubmit} className="p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Student ERP &amp; Degree Vault</h3>
              <p className="text-xs text-slate-500">Sign in with your Permanent Registration Number (PRN) &amp; Student Password</p>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Permanent Registration No. (PRN):
                </label>
                <input
                  type="text"
                  value={studentPrn}
                  onChange={(e) => setStudentPrn(e.target.value.toUpperCase())}
                  required
                  placeholder="PRN20200101"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Student Password / PIN:
                </label>
                <input
                  type="password"
                  value={studentPass}
                  onChange={(e) => setStudentPass(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

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
              <span>{loading ? "Signing In..." : "Sign In to Student Portal"}</span>
            </button>
          </form>
        )}

        {/* TAB 2: EXAM CELL AUTHORITY LOGIN */}
        {activeTab === "EXAM_ADMIN" && (
          <form onSubmit={handleAdminSubmit} className="p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Exam Cell Controller Console</h3>
                <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-bold uppercase">
                  Level 4 Authority
                </span>
              </div>
              <p className="text-xs text-slate-500">Authorized for batch Merkle root anchoring &amp; dynamic 256-bit revocations</p>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Exam Officer Staff ID:
                </label>
                <input
                  type="text"
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value.toUpperCase())}
                  required
                  placeholder="EXAM_ADMIN_MGM"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Master Authority Passkey:
                </label>
                <input
                  type="password"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

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
                <span>Auto-Fill Controller of Exams (Prof. V. M. Deshpande)</span>
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
              <span>{loading ? "Authorizing Clearance..." : "Authorize & Enter Exam Cell Console"}</span>
            </button>
          </form>
        )}

        {/* TAB 3: INSTITUTIONAL STAFF LOGIN */}
        {activeTab === "UNIVERSITY_STAFF" && (
          <form onSubmit={handleStaffSubmit} className="p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Institutional Verification Desk</h3>
              <p className="text-xs text-slate-500">Select your departmental role to access specialized verification tooling</p>
            </div>

            {/* Department Selection */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                1. Select Department Role:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div
                  onClick={() => {
                    setStaffDept("PG_ADMISSIONS_OFFICER");
                    setStaffId(DEMO_CREDENTIALS.staff.admissions.staffId);
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    staffDept === "PG_ADMISSIONS_OFFICER"
                      ? "bg-blue-50 border-blue-600 ring-2 ring-blue-500/20"
                      : "bg-slate-50 border-slate-200 hover:border-blue-300"
                  }`}
                >
                  <GraduationCap className="h-4 w-4 text-blue-600 mb-1" />
                  <div className="text-xs font-bold text-slate-900">PG Admissions</div>
                </div>

                <div
                  onClick={() => {
                    setStaffDept("NEP_ABC_COORDINATOR");
                    setStaffId(DEMO_CREDENTIALS.staff.nep.staffId);
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    staffDept === "NEP_ABC_COORDINATOR"
                      ? "bg-purple-50 border-purple-600 ring-2 ring-purple-500/20"
                      : "bg-slate-50 border-slate-200 hover:border-purple-300"
                  }`}
                >
                  <Sparkles className="h-4 w-4 text-purple-600 mb-1" />
                  <div className="text-xs font-bold text-slate-900">NEP 2020 ABC</div>
                </div>

                <div
                  onClick={() => {
                    setStaffDept("PLACEMENT_OFFICER_TNP");
                    setStaffId(DEMO_CREDENTIALS.staff.placement.staffId);
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    staffDept === "PLACEMENT_OFFICER_TNP"
                      ? "bg-emerald-50 border-emerald-600 ring-2 ring-emerald-500/20"
                      : "bg-slate-50 border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600 mb-1" />
                  <div className="text-xs font-bold text-slate-900">Placement T&amp;P</div>
                </div>
              </div>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Employee Staff ID:
                </label>
                <input
                  type="text"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                  required
                  placeholder="STAFF_ADM_01"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Staff Password / PIN:
                </label>
                <input
                  type="password"
                  value={staffPass}
                  onChange={(e) => setStaffPass(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

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
                <span>Auto-Fill {staffDept === "PG_ADMISSIONS_OFFICER" ? "Dr. Joshi (Admissions)" : staffDept === "NEP_ABC_COORDINATOR" ? "Prof. Kulkarni (NEP ABC)" : "Col. Rathore (Placement)"}</span>
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
              <span>{loading ? "Signing In..." : "Unlock Departmental Desk"}</span>
            </button>
          </form>
        )}
      </div>

      {/* Back to Home Link */}
      <div className="text-center">
        <Link href="/" className="text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors">
          &larr; Back to Public Verifier
        </Link>
      </div>
    </div>
  );
}
