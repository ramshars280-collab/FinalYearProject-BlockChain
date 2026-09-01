"use client";

import React, { useState } from "react";
import {
  Lock,
  ShieldAlert,
  UserCheck,
  Shield,
  Briefcase,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ArrowRight,
  GraduationCap,
} from "lucide-react";
import { useAuth, DEMO_CREDENTIALS } from "../context/AuthContext";
import { UserRole, DepartmentRole } from "../types/auth";

interface AuthGuardProps {
  requiredRole: UserRole;
  children: React.ReactNode;
  title: string;
  description: string;
}

export default function AuthGuard({
  requiredRole,
  children,
  title,
  description,
}: AuthGuardProps) {
  const { user, isAuthenticated, loginStudent, loginAdmin, loginStaff } = useAuth();

  // Local state for inline login card
  const [studentPrn, setStudentPrn] = useState(DEMO_CREDENTIALS.student.prn);
  const [studentPass, setStudentPass] = useState(DEMO_CREDENTIALS.student.password);

  const [adminId, setAdminId] = useState(DEMO_CREDENTIALS.admin.staffId);
  const [adminPass, setAdminPass] = useState(DEMO_CREDENTIALS.admin.password);

  const [staffId, setStaffId] = useState(DEMO_CREDENTIALS.staff.admissions.staffId);
  const [staffPass, setStaffPass] = useState(DEMO_CREDENTIALS.staff.admissions.password);
  const [staffDept, setStaffDept] = useState<DepartmentRole>("PG_ADMISSIONS_OFFICER");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check if authenticated with required role
  const isAuthorized = isAuthenticated && user && (user.role === requiredRole || (user.role === "EXAM_ADMIN" && requiredRole === "UNIVERSITY_STAFF"));

  if (isAuthorized) {
    return <>{children}</>;
  }

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const res = await loginStudent(studentPrn, studentPass);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Authentication failed");
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const res = await loginAdmin(adminId, adminPass);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Authentication failed");
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const res = await loginStaff(staffId, staffPass, staffDept);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Authentication failed");
    }
  };

  return (
    <div className="max-w-xl mx-auto py-12 px-4 space-y-6">
      <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 shadow-xl space-y-6 text-center">
        {/* Header Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shadow-xs">
          <Lock className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 text-blue-900 rounded-full text-xs font-bold">
            <Shield className="h-3.5 w-3.5 text-blue-600" />
            <span>Protected Operational View &bull; Role Required</span>
          </div>

          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            {title}
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {description}
          </p>
        </div>

        {/* STUDENT LOGIN FORM */}
        {requiredRole === "STUDENT" && (
          <form onSubmit={handleStudentLogin} className="space-y-4 text-left pt-2">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Permanent Registration Number (PRN):
                </label>
                <input
                  type="text"
                  value={studentPrn}
                  onChange={(e) => setStudentPrn(e.target.value.toUpperCase())}
                  required
                  placeholder="e.g. PRN20200101"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Student Portal Password:
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
                <span>Auto-Fill Demo Student</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-98 disabled:opacity-50"
            >
              <UserCheck className="h-4 w-4" />
              <span>{loading ? "Authenticating SSO..." : "Sign In as Student"}</span>
            </button>
          </form>
        )}

        {/* EXAM CELL ADMIN LOGIN FORM */}
        {requiredRole === "EXAM_ADMIN" && (
          <form onSubmit={handleAdminLogin} className="space-y-4 text-left pt-2">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Exam Cell Staff ID:
                </label>
                <input
                  type="text"
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value.toUpperCase())}
                  required
                  placeholder="e.g. EXAM_ADMIN_MGM"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Authority Master Password:
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
                <span>Auto-Fill Demo Exam Admin</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-98 disabled:opacity-50"
            >
              <Shield className="h-4 w-4" />
              <span>{loading ? "Verifying Authority..." : "Sign In to Exam Cell"}</span>
            </button>
          </form>
        )}

        {/* UNIVERSITY STAFF LOGIN FORM */}
        {requiredRole === "UNIVERSITY_STAFF" && (
          <form onSubmit={handleStaffLogin} className="space-y-4 text-left pt-2">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Department Role:
                </label>
                <select
                  value={staffDept}
                  onChange={(e) => {
                    const d = e.target.value as DepartmentRole;
                    setStaffDept(d);
                    if (d === "PG_ADMISSIONS_OFFICER") setStaffId(DEMO_CREDENTIALS.staff.admissions.staffId);
                    else if (d === "NEP_ABC_COORDINATOR") setStaffId(DEMO_CREDENTIALS.staff.nep.staffId);
                    else setStaffId(DEMO_CREDENTIALS.staff.placement.staffId);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  <option value="PG_ADMISSIONS_OFFICER">1. PG &amp; Lateral Admissions Desk</option>
                  <option value="NEP_ABC_COORDINATOR">2. NEP 2020 ABC Credit Transfer Desk</option>
                  <option value="PLACEMENT_OFFICER_TNP">3. Placement Cell (T&amp;P Audit)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Staff ID:
                </label>
                <input
                  type="text"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                  required
                  placeholder="e.g. STAFF_ADM_01"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Password:
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

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setStaffDept("PG_ADMISSIONS_OFFICER");
                  setStaffId(DEMO_CREDENTIALS.staff.admissions.staffId);
                  setStaffPass("staff123");
                }}
                className="text-blue-700 font-bold hover:underline flex items-center gap-1"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Fill Demo Staff</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-98 disabled:opacity-50"
            >
              <Briefcase className="h-4 w-4" />
              <span>{loading ? "Authenticating Desk..." : "Unlock Institutional Desk"}</span>
            </button>
          </form>
        )}

        {/* Error Feedback */}
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-900 text-xs flex items-start gap-2 font-semibold animate-in fade-in">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
