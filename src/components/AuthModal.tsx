"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  UserCheck,
  Shield,
  Briefcase,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Building2,
  FileSpreadsheet,
} from "lucide-react";
import { useAuth, DEMO_CREDENTIALS } from "../context/AuthContext";
import { UserRole, DepartmentRole } from "../types/auth";

export default function AuthModal() {
  const router = useRouter();
  const {
    isAuthModalOpen,
    closeAuthModal,
    modalInitialRole,
    loginStudent,
    loginAdmin,
    loginStaff,
  } = useAuth();

  // Active role is strictly locked to modalInitialRole (no cross-role tabs)
  const role: UserRole = modalInitialRole || "STUDENT";

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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [modalInitialRole]);

  if (!isAuthModalOpen) return null;

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const res = await loginStudent(studentPrn, studentPass);
    setLoading(false);
    if (res.success) {
      setSuccessMsg("Student session authenticated!");
      setTimeout(() => {
        closeAuthModal();
        router.push("/student");
      }, 400);
    } else {
      setErrorMsg(res.error || "Login failed");
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const res = await loginAdmin(adminId, adminPass);
    setLoading(false);
    if (res.success) {
      setSuccessMsg("Exam Cell Admin credentials verified!");
      setTimeout(() => {
        closeAuthModal();
        router.push("/issuer");
      }, 400);
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
      setSuccessMsg("Departmental Staff access authorized!");
      setTimeout(() => {
        closeAuthModal();
        router.push("/university-verifier");
      }, 400);
    } else {
      setErrorMsg(res.error || "Staff login failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl relative border border-slate-200 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 z-20 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* 1. STRICT STUDENT ONLY LOGIN MODAL */}
        {role === "STUDENT" && (
          <div>
            <div className="bg-gradient-to-r from-blue-700 to-blue-900 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
                  <GraduationCap className="h-7 w-7 text-blue-200" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest bg-white/20 px-2 py-0.5 rounded-full text-blue-100">
                    Student Login Only
                  </span>
                  <h3 className="text-xl font-black text-white mt-1">
                    Student ERP &bull; Academic SSO
                  </h3>
                </div>
              </div>
            </div>

            <form onSubmit={handleStudentSubmit} className="p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Permanent Registration Number (PRN):
                  </label>
                  <input
                    type="text"
                    value={studentPrn}
                    onChange={(e) => setStudentPrn(e.target.value.toUpperCase())}
                    required
                    placeholder="PRN20200101"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Student Portal Password / PIN:
                  </label>
                  <input
                    type="password"
                    value={studentPass}
                    onChange={(e) => setStudentPass(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStudentPrn(DEMO_CREDENTIALS.student.prn);
                    setStudentPass(DEMO_CREDENTIALS.student.password);
                  }}
                  className="text-blue-700 font-bold hover:underline flex items-center gap-1"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Auto-Fill Student (Aarav Sharma - PRN20200101)</span>
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center gap-2 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50"
              >
                <UserCheck className="h-4 w-4" />
                <span>{loading ? "Authenticating SSO..." : "Sign In to Student Vault"}</span>
              </button>
            </form>
          </div>
        )}

        {/* 2. STRICT EXAM CELL ADMIN ONLY LOGIN MODAL */}
        {role === "EXAM_ADMIN" && (
          <div>
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <Shield className="h-7 w-7" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full">
                    Admin Authority Only &bull; Level 4 Clearance
                  </span>
                  <h3 className="text-xl font-black text-white mt-1">
                    Exam Cell Authority Login
                  </h3>
                </div>
              </div>
            </div>

            <form onSubmit={handleAdminSubmit} className="p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
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
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Authority Master Passkey:
                  </label>
                  <input
                    type="password"
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAdminId(DEMO_CREDENTIALS.admin.staffId);
                    setAdminPass(DEMO_CREDENTIALS.admin.password);
                  }}
                  className="text-blue-700 font-bold hover:underline flex items-center gap-1"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Auto-Fill Controller of Examinations</span>
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center gap-2 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-slate-900 hover:bg-black text-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-slate-900/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50"
              >
                <Shield className="h-4 w-4 text-amber-400" />
                <span>{loading ? "Verifying Clearance..." : "Authorize Exam Cell Dashboard"}</span>
              </button>
            </form>
          </div>
        )}

        {/* 3. STRICT UNIVERSITY STAFF ONLY LOGIN MODAL */}
        {role === "UNIVERSITY_STAFF" && (
          <div>
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-blue-200">
                  <Building2 className="h-7 w-7" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-800/80 border border-blue-700 px-2 py-0.5 rounded-full text-blue-200">
                    University Staff Only
                  </span>
                  <h3 className="text-xl font-black text-white mt-1">
                    Institutional Departmental Portal
                  </h3>
                </div>
              </div>
            </div>

            <form onSubmit={handleStaffSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Choose Departmental Authority:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div
                    onClick={() => {
                      setStaffDept("PG_ADMISSIONS_OFFICER");
                      setStaffId(DEMO_CREDENTIALS.staff.admissions.staffId);
                    }}
                    className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                      staffDept === "PG_ADMISSIONS_OFFICER"
                        ? "bg-blue-50 border-blue-600 ring-2 ring-blue-500/20 font-bold"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="text-[11px] text-slate-900">PG Admissions</div>
                  </div>

                  <div
                    onClick={() => {
                      setStaffDept("NEP_ABC_COORDINATOR");
                      setStaffId(DEMO_CREDENTIALS.staff.nep.staffId);
                    }}
                    className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                      staffDept === "NEP_ABC_COORDINATOR"
                        ? "bg-purple-50 border-purple-600 ring-2 ring-purple-500/20 font-bold"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="text-[11px] text-slate-900">NEP ABC</div>
                  </div>

                  <div
                    onClick={() => {
                      setStaffDept("PLACEMENT_OFFICER_TNP");
                      setStaffId(DEMO_CREDENTIALS.staff.placement.staffId);
                    }}
                    className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                      staffDept === "PLACEMENT_OFFICER_TNP"
                        ? "bg-emerald-50 border-emerald-600 ring-2 ring-emerald-500/20 font-bold"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="text-[11px] text-slate-900">Placement</div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
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
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Staff Passkey:
                  </label>
                  <input
                    type="password"
                    value={staffPass}
                    onChange={(e) => setStaffPass(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (staffDept === "PG_ADMISSIONS_OFFICER") setStaffId(DEMO_CREDENTIALS.staff.admissions.staffId);
                    else if (staffDept === "NEP_ABC_COORDINATOR") setStaffId(DEMO_CREDENTIALS.staff.nep.staffId);
                    else setStaffId(DEMO_CREDENTIALS.staff.placement.staffId);
                    setStaffPass("staff123");
                  }}
                  className="text-blue-700 font-bold hover:underline flex items-center gap-1"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Auto-Fill Demo Staff</span>
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center gap-2 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-900/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50"
              >
                <Briefcase className="h-4 w-4" />
                <span>{loading ? "Authenticating..." : "Unlock Institutional Desk"}</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
