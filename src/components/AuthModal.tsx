"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  UserCheck,
  ShieldAlert,
  Building2,
  Lock,
  KeyRound,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  User,
  Shield,
  Briefcase,
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

  const [activeTab, setActiveTab] = useState<UserRole>(modalInitialRole || "STUDENT");

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
    if (modalInitialRole) {
      setActiveTab(modalInitialRole);
    }
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
      }, 500);
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
      }, 500);
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
      }, 500);
    } else {
      setErrorMsg(res.error || "Staff login failed");
    }
  };

  const fillStudentDemo = () => {
    setStudentPrn(DEMO_CREDENTIALS.student.prn);
    setStudentPass(DEMO_CREDENTIALS.student.password);
  };

  const fillAdminDemo = () => {
    setAdminId(DEMO_CREDENTIALS.admin.staffId);
    setAdminPass(DEMO_CREDENTIALS.admin.password);
  };

  const fillStaffDemo = (dept: DepartmentRole) => {
    setStaffDept(dept);
    if (dept === "PG_ADMISSIONS_OFFICER") {
      setStaffId(DEMO_CREDENTIALS.staff.admissions.staffId);
    } else if (dept === "NEP_ABC_COORDINATOR") {
      setStaffId(DEMO_CREDENTIALS.staff.nep.staffId);
    } else {
      setStaffId(DEMO_CREDENTIALS.staff.placement.staffId);
    }
    setStaffPass("staff123");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative border border-slate-200 space-y-6">
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-2xl">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">
              MGM Trust Registry Authentication Gate
            </h3>
            <p className="text-xs text-slate-500">
              Role-Based Access Control (RBAC) &bull; DPDP Act Compliant
            </p>
          </div>
        </div>

        {/* Role Selector Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setActiveTab("STUDENT");
              setErrorMsg(null);
            }}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "STUDENT"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-blue-900"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            <span>Student SSO</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("EXAM_ADMIN");
              setErrorMsg(null);
            }}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "EXAM_ADMIN"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-blue-900"
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Exam Admin</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("UNIVERSITY_STAFF");
              setErrorMsg(null);
            }}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "UNIVERSITY_STAFF"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-blue-900"
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span>Univ. Staff</span>
          </button>
        </div>

        {/* TAB 1: STUDENT SSO LOGIN */}
        {activeTab === "STUDENT" && (
          <form onSubmit={handleStudentSubmit} className="space-y-4">
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

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={fillStudentDemo}
                className="text-xs text-blue-700 font-bold hover:underline flex items-center gap-1"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Fill Student Credentials</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-98 disabled:opacity-50"
            >
              <UserCheck className="h-4 w-4" />
              <span>{loading ? "Authenticating SSO..." : "Sign In to Student Vault"}</span>
            </button>
          </form>
        )}

        {/* TAB 2: EXAM CELL ADMIN LOGIN */}
        {activeTab === "EXAM_ADMIN" && (
          <form onSubmit={handleAdminSubmit} className="space-y-4">
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

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={fillAdminDemo}
                className="text-xs text-blue-700 font-bold hover:underline flex items-center gap-1"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Fill Admin Credentials</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-98 disabled:opacity-50"
            >
              <Shield className="h-4 w-4" />
              <span>{loading ? "Verifying Authority..." : "Unlock Exam Cell Dashboard"}</span>
            </button>
          </form>
        )}

        {/* TAB 3: UNIVERSITY STAFF LOGIN */}
        {activeTab === "UNIVERSITY_STAFF" && (
          <form onSubmit={handleStaffSubmit} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Department Role:
                </label>
                <select
                  value={staffDept}
                  onChange={(e) => {
                    const d = e.target.value as DepartmentRole;
                    setStaffDept(d);
                    fillStaffDemo(d);
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
                  University Staff ID:
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
                  Staff Access PIN / Password:
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
                onClick={() => fillStaffDemo(staffDept)}
                className="text-xs text-blue-700 font-bold hover:underline flex items-center gap-1"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Fill Staff Credentials</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-98 disabled:opacity-50"
            >
              <Briefcase className="h-4 w-4" />
              <span>{loading ? "Authorizing Desk..." : "Access Departmental Desk"}</span>
            </button>
          </form>
        )}

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-900 text-xs flex items-start gap-2 font-semibold animate-in fade-in">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs flex items-start gap-2 font-bold animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
