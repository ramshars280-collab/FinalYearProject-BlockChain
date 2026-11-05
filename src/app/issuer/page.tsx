"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { ethers } from "ethers";
import {
  Layers,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  ShieldCheck,
  Flame,
  Clock,
  ExternalLink,
  ChevronRight,
  Sparkles,
  ShieldAlert,
  Cpu,
  TrendingDown,
  Terminal,
  LogOut,
  Shield,
  Building2,
  PlusCircle,
  Search,
  Filter,
  FileCheck2,
  AlertTriangle,
  XCircle,
  KeyRound,
  Eye,
  EyeOff,
  UserPlus,
  RefreshCw,
  Copy,
  Check,
  X,
} from "lucide-react";
import { StudentDegreeData, BatchRecord, W3CCredentialPayload, ConsortiumInstitution, BatchStatus } from "../../types";
import { buildBatchMerkleTree, createW3CCredential } from "../../lib/crypto";
import { generateCredentialsZip, downloadFile } from "../../lib/zipHelper";
import {
  getStoredBatches,
  saveStoredBatches,
  getSepoliaConfig,
  getConsortiumInstitutions,
  sanitizeObsoleteStorage,
  INITIAL_STUDENTS_MGM,
} from "../../lib/storage";
import { CREDENTIAL_REGISTRY_ABI, getProvider, getProviderForChain } from "../../lib/contracts";
import { getNetworkConfig, SupportedChainId } from "../../contracts";
import MerkleTreeVisualizer from "../../components/MerkleTreeVisualizer";
import BatchRevocationModal from "../../components/BatchRevocationModal";
import AddStudentModal from "../../components/AddStudentModal";
import UploadedStudentsList from "../../components/UploadedStudentsList";
import { useAuth, DEMO_IDENTIFIERS } from "../../context/AuthContext";
import { useWeb3 } from "../../context/Web3Context";
import { INITIAL_AUDIT_CANDIDATES, CandidateAuditRecord } from "../../lib/auditData";

export default function IssuerPage() {
  const router = useRouter();
  const { user, isAuthenticated, loginAdmin, logout } = useAuth();

  // Admin Login State
  const [adminId, setAdminId] = useState(DEMO_IDENTIFIERS.adminStaffId);
  const [adminPass, setAdminPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    const res = await loginAdmin(adminId, adminPass);
    setLoginLoading(false);
    if (!res.success) {
      setLoginError(res.error || "Admin authentication failed");
    } else {
      router.push("/issuer");
    }
  };

  // 1. SESSION CONFLICT: If already logged in as Student, show Access Denied notice
  if (isAuthenticated && user?.role === "STUDENT") {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-amber-200 shadow-xl p-8 sm:p-10 space-y-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mx-auto shadow-inner">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <span className="px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-xs font-bold uppercase tracking-wider">
            Access Restricted
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
            Access Restricted to Exam Authority
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            You are currently signed in with an active <strong>Student</strong> session for{" "}
            <span className="font-mono font-bold text-slate-900">{(user as any).prn}</span> ({(user as any).fullName || "Aarav Sharma"}).
            Batch Merkle root anchoring and candidate audit tools require <strong>Level 4 Examination Authority</strong> credentials.
          </p>
        </div>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/student"
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            Return to Student Vault
          </Link>
          <button
            onClick={logout}
            className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-300 rounded-xl text-xs font-bold transition-all"
          >
            Sign Out &amp; Switch Account
          </button>
        </div>
      </div>
    );
  }

  // 2. UNAUTHENTICATED: Full-Page Split Screen View
  if (!isAuthenticated || !user || user.role !== "EXAM_ADMIN") {
    return (
      <div className="w-full max-w-5xl mx-auto my-4 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 grid grid-cols-1 lg:grid-cols-12 min-h-[580px] bg-white">
        {/* LEFT SIDE: University Admin Branding */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle decorative glow */}
          <div className="absolute -right-16 -top-16 w-56 h-56 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-56 h-56 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

          {/* Top: Authority Brand */}
          <div className="space-y-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 backdrop-blur-md border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-inner">
                <Shield className="h-7 w-7" />
              </div>
              <div>
                <span className="text-xs uppercase font-extrabold tracking-widest text-amber-400 block">
                  Examination Authority
                </span>
                <span className="text-[10px] text-slate-300 font-medium">
                  Controller of Examinations &bull; MGM University
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-400/15 backdrop-blur-xs rounded-full text-[11px] font-bold text-amber-300 border border-amber-400/25">
              <Shield className="h-3 w-3 text-amber-400" />
              <span>Clearance Level 4 &bull; Administrator ERP</span>
            </div>
          </div>

          {/* Center: Official Institutional Office */}
          <div className="space-y-4 my-8 relative z-10">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-amber-400/90 uppercase tracking-widest block">
                Office of the Controller of Examinations
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Academic Credential Registry Console
              </h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Official institutional portal for accredited university officers. Authorized personnel only. All access is cryptographically audited and recorded.
            </p>
          </div>

          {/* Bottom Footer Note */}
          <div className="pt-4 border-t border-white/10 text-[11px] text-slate-400 flex items-center justify-between relative z-10">
            <span>MGM University Trust Network</span>
            <span className="font-mono font-bold text-amber-400">COE-AUTH-01</span>
          </div>
        </div>

        {/* RIGHT SIDE: Admin Login Form */}
        <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                Exam Authority Login
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Enter your authorized Examination Cell Officer ID and master passkey.
              </p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Officer Staff ID:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Shield className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value.toUpperCase())}
                    required
                    placeholder="EXAM_ADMIN_MGM"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3.5 py-3 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-hidden transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Master Authority Passkey:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-10 py-3 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Demo Auto-Fill Shortcut */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between">
                <span className="text-[11px] text-amber-900 font-semibold">Demo Staff ID:</span>
                <button
                  type="button"
                  onClick={() => {
                    setAdminId(DEMO_IDENTIFIERS.adminStaffId);
                  }}
                  className="text-xs text-amber-800 font-bold hover:underline flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3 text-amber-600" />
                  <span>Fill ID ({DEMO_IDENTIFIERS.adminStaffId})</span>
                </button>
              </div>

              {loginError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-950 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-slate-900/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50"
              >
                <Shield className="h-4 w-4 text-amber-400" />
                <span>{loginLoading ? "Authorizing Clearance..." : "Authorize & Enter Admin Console"}</span>
              </button>
            </form>

            <div className="pt-2 text-center text-[11px] text-slate-400">
              Clearance Level 4 Security Protocol &bull; Controller of Examinations
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <UniversityAdminWorkspace logout={logout} />;
}

interface CsvRowError {
  rowNumber: number;
  prn?: string;
  errors: string[];
}

function renderBatchStatusBadge(status?: BatchStatus, txHash?: string | null, isVerifiedOnChain?: boolean, targetChainId?: number) {
  switch (status) {
    case "ANCHORED":
      if (txHash && isVerifiedOnChain !== false) {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-full text-[10px] font-black uppercase tracking-wide shadow-2xs">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>{targetChainId === 31337 ? "Anchored (Hardhat Local)" : "Anchored (Ethereum Sepolia)"}</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-900 border border-blue-300 rounded-full text-[10px] font-black uppercase tracking-wide shadow-2xs">
          <Building2 className="h-3 w-3 text-blue-600" />
          <span>Institutional DB</span>
        </span>
      );
    case "PENDING_ANCHOR":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[10px] font-black uppercase tracking-wide shadow-2xs">
          <Clock className="h-3 w-3 text-amber-600" />
          <span>Pending Anchor</span>
        </span>
      );
    case "INSTITUTIONAL_STORED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-900 border border-blue-300 rounded-full text-[10px] font-black uppercase tracking-wide shadow-2xs">
          <Building2 className="h-3 w-3 text-blue-600" />
          <span>Institutional DB</span>
        </span>
      );
    case "ANCHOR_FAILED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-900 border border-red-300 rounded-full text-[10px] font-black uppercase tracking-wide shadow-2xs">
          <AlertCircle className="h-3 w-3 text-red-600" />
          <span>Anchor Failed</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-300 rounded-full text-[10px] font-bold uppercase tracking-wide">
          <span>{status || "Stored"}</span>
        </span>
      );
  }
}

// ==========================================
// UNIVERSITY ADMIN CONSOLE WORKSPACE (3 SECTIONS)
// ==========================================

function UniversityAdminWorkspace({ logout }: { logout: () => void }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"minting" | "audit">("minting");

  // Synchronized Blockchain Network & Wallet State from Web3Context
  const {
    selectedAppChainId: selectedNetworkChainId,
    setSelectedAppChainId: setSelectedNetworkChainId,
    walletChainId,
    walletAddress,
    isWalletConnected,
    isNetworkMismatch,
    walletNetworkName,
  } = useWeb3();

  // Tab 1: Batch Minting State
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [institutions, setInstitutions] = useState<ConsortiumInstitution[]>([]);
  const [selectedInstitution, setSelectedInstitution] = useState<ConsortiumInstitution | null>(null);
  const [batchId, setBatchId] = useState<string>("");
  const [currentStudents, setCurrentStudents] = useState<StudentDegreeData[]>([]);
  const [computedTreeData, setComputedTreeData] = useState<any>(null);
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [anchorSuccess, setAnchorSuccess] = useState<any>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [revocationModalBatch, setRevocationModalBatch] = useState<BatchRecord | null>(null);
  const [csvErrors, setCsvErrors] = useState<CsvRowError[]>([]);
  const [csvSuccess, setCsvSuccess] = useState<{ fileName: string; count: number } | null>(null);
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [isConfirmingUpload, setIsConfirmingUpload] = useState(false);
  const [confirmUploadError, setConfirmUploadError] = useState<string | null>(null);
  const [uploadSuccessNotification, setUploadSuccessNotification] = useState<{
    batchId: string;
    count: number;
    fileName?: string;
    timestamp?: number;
  } | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{
    fileName: string;
    students: StudentDegreeData[];
    duplicateWarnings?: string[];
  } | null>(null);
  const [anchorError, setAnchorError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab 2: Candidate Audit State
  const [auditRows, setAuditRows] = useState<CandidateAuditRecord[]>([]);
  const [auditFilter, setAuditFilter] = useState<"ALL" | "AUTHENTIC" | "DISCREPANCY" | "UNREGISTERED">("ALL");
  const [auditSearch, setAuditSearch] = useState<string>("");



  useEffect(() => {
    sanitizeObsoleteStorage();
    loadInstitutions();
    loadBatches();
  }, []);

  const loadInstitutions = () => {
    const list = getConsortiumInstitutions();
    setInstitutions(list);
    if (!selectedInstitution && list.length > 0) {
      setSelectedInstitution(list[0]);
    }
  };

  const loadBatches = async () => {
    try {
      const res = await fetch("/api/batches", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.batches)) {
          setBatches(data.batches);
          saveStoredBatches(data.batches);
          return;
        }
      }
    } catch (err) {
      console.warn("Could not load batches from /api/batches, falling back to local storage:", err);
    }
    const stored = getStoredBatches();
    setBatches(stored);
  };

  const recalculateTree = (students: StudentDegreeData[]) => {
    if (students.length === 0) return;
    const treeData = buildBatchMerkleTree(students);
    setComputedTreeData(treeData);
  };

  const handleAddManualStudent = (newStudent: StudentDegreeData, replaceAll: boolean) => {
    let updated: StudentDegreeData[];
    if (replaceAll) {
      updated = [newStudent];
    } else {
      updated = [newStudent, ...currentStudents.filter((s) => s.prn.toUpperCase() !== newStudent.prn.toUpperCase())];
    }

    const duplicateWarnings: string[] = [];
    batches.forEach((b) => {
      if (b.records) {
        b.records.forEach((r) => {
          if (r.prn.toUpperCase() === newStudent.prn.toUpperCase()) {
            duplicateWarnings.push(`PRN "${newStudent.prn}" already exists in anchored batch "${b.batchId}"`);
          }
        });
      }
    });

    setIsAddStudentModalOpen(false);

    // Route manual student addition through the Confirmation Bar / Dialog workflow
    setPendingUpload({
      fileName: replaceAll
        ? `Manual Entry: ${newStudent.prn} (${newStudent.fullName})`
        : `Manual Addition: ${newStudent.prn} (${newStudent.fullName})`,
      students: updated,
      duplicateWarnings: duplicateWarnings.length > 0 ? duplicateWarnings : undefined,
    });
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header: string) => header.trim().replace(/^\uFEFF/, ""),
      complete: (results) => {
        const errorsList: CsvRowError[] = [];
        const parsedStudents: StudentDegreeData[] = [];

        results.data.forEach((row: any, i: number) => {
          const rowNumber = i + 2; // +1 for 0-index, +1 for CSV header line
          const rowErrors: string[] = [];

          // Create normalized key lookup dictionary (lowercase, stripped of all punctuation & spaces)
          const norm: Record<string, string> = {};
          for (const [k, v] of Object.entries(row)) {
            const cleanKey = k.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
            norm[cleanKey] =
              typeof v === "string"
                ? v.trim()
                : v !== null && v !== undefined
                ? String(v).trim()
                : "";
          }

          const getVal = (...keys: string[]): string => {
            for (const k of keys) {
              const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (norm[cleanK] !== undefined && norm[cleanK] !== "") {
                return norm[cleanK];
              }
            }
            return "";
          };

          // Skip completely empty rows (common in Excel exports)
          const hasAnyValue = Object.values(norm).some((val) => val !== "");
          if (!hasAnyValue) {
            return;
          }

          // 1. Validate PRN format & presence (support PRN, Roll No, Reg No, Student ID, etc.)
          const rawPrn = getVal(
            "prn",
            "prnno",
            "rollno",
            "rollnumber",
            "studentid",
            "enrollmentno",
            "regno",
            "registrationno",
            "id",
            "candidateid"
          );
          if (!rawPrn) {
            rowErrors.push("Missing required field: PRN (or Roll No / Student ID)");
          } else if (!/^[A-Z0-9_./-]{2,40}$/i.test(rawPrn)) {
            rowErrors.push(`Invalid PRN format "${rawPrn}" (must be alphanumeric, 2-40 characters)`);
          }

          // 2. Validate Full Name (support Full Name, Name, Student Name, etc.)
          const rawName = getVal(
            "fullname",
            "studentfullname",
            "studentname",
            "name",
            "candidatename"
          );
          if (!rawName) {
            rowErrors.push("Missing required field: Student Full Name");
          } else if (rawName.length < 2) {
            rowErrors.push("Student name too short (minimum 2 characters)");
          }

          // 3. Validate Degree (support Degree, Degree / Program, Course, Program, etc. Defaults to Bachelor of Technology if omitted)
          let rawDegree = getVal(
            "degree",
            "degreename",
            "degreeprogram",
            "program",
            "programme",
            "course"
          );
          if (!rawDegree) {
            rawDegree = "Bachelor of Technology";
          }

          // 4. Validate Branch / Major (support Branch, Branch / Major, Major, Department, Stream, Specialization)
          const rawBranch = getVal(
            "branch",
            "branchmajor",
            "major",
            "department",
            "specialization",
            "stream",
            "discipline"
          );
          if (!rawBranch) {
            rowErrors.push("Missing required field: Branch / Major");
          }

          // 5. Validate CGPA in sane range (0.00 to 10.00)
          const rawCgpaStr = getVal("cgpa", "gpa", "marks", "score", "percentage", "grade");
          const parsedCgpa = parseFloat(rawCgpaStr);
          if (rawCgpaStr === "" || isNaN(parsedCgpa)) {
            rowErrors.push("Missing or non-numeric CGPA");
          } else if (parsedCgpa < 0 || parsedCgpa > 10) {
            rowErrors.push(`CGPA (${parsedCgpa}) out of valid range 0.00 - 10.00`);
          }

          // 6. Validate Graduation Year (defaults to current year if omitted)
          const rawYearStr = getVal("graduationyear", "gradyear", "year", "passingyear", "batchyear", "batch");
          let parsedYear = parseInt(rawYearStr, 10);
          if (rawYearStr === "" || isNaN(parsedYear)) {
            parsedYear = new Date().getFullYear();
          } else if (parsedYear < 1950 || parsedYear > 2100) {
            rowErrors.push(`Graduation Year (${parsedYear}) out of valid range 1950 - 2100`);
          }

          if (rowErrors.length > 0) {
            errorsList.push({
              rowNumber,
              prn: rawPrn || `Row ${rowNumber}`,
              errors: rowErrors,
            });
          } else {
            // Read and map institute & university preserving both distinctly
            const rawInstitute =
              getVal("institute", "institutename", "school", "faculty") ||
              (norm["university"] ? getVal("college", "institution") : "");
            const rawUniversity =
              getVal("university", "universityname") ||
              (!rawInstitute ? getVal("institution", "college") : "") ||
              selectedInstitution?.name ||
              "MGM University";

            parsedStudents.push({
              prn: rawPrn.toUpperCase(),
              fullName: rawName,
              degree: rawDegree,
              branch: rawBranch,
              cgpa: parsedCgpa,
              graduationYear: parsedYear,
              issueDate: getVal("issuedate", "date", "graduationdate") || new Date().toISOString().split("T")[0],
              nheqfCredits: parseInt(getVal("creditscompleted", "credits", "nheqfcredits", "totalcredits") || "160", 10),
              nheqfLevel: parseFloat(getVal("level", "nheqflevel") || "6.0"),
              institute: rawInstitute || undefined,
              university: rawUniversity,
              institutionCode: selectedInstitution?.code || "MGMU-ENG-01",
            });
          }
        });

        if (errorsList.length > 0) {
          setCsvErrors(errorsList);
          setCsvSuccess(null);
          setUploadSuccessNotification(null);
          setCurrentStudents([]);
          setComputedTreeData(null);
          setAnchorSuccess(null);
        } else if (parsedStudents.length === 0) {
          setCsvErrors([{ rowNumber: 1, errors: ["CSV contains no student data rows"] }]);
          setCsvSuccess(null);
          setUploadSuccessNotification(null);
          setPendingUpload(null);
          setCurrentStudents([]);
          setComputedTreeData(null);
          setAnchorSuccess(null);
        } else {
          setCsvErrors([]);

          // Duplicate PRN detection inside file and across existing batches
          const seenPrns = new Set<string>();
          const duplicateWarnings: string[] = [];
          parsedStudents.forEach((s) => {
            if (seenPrns.has(s.prn)) {
              duplicateWarnings.push(`PRN "${s.prn}" appears multiple times in CSV`);
            }
            seenPrns.add(s.prn);
          });

          batches.forEach((b) => {
            if (b.records) {
              b.records.forEach((r) => {
                if (seenPrns.has(r.prn.toUpperCase()) && !duplicateWarnings.some((w) => w.includes(r.prn.toUpperCase()))) {
                  duplicateWarnings.push(`PRN "${r.prn.toUpperCase()}" already anchored in Batch "${b.batchId}"`);
                }
              });
            }
          });

          // Auto-suggest sanitized batch ID from file name if user has not entered one
          if (!batchId.trim()) {
            const suggestedId = file.name
              .replace(/\.[^/.]+$/, "")
              .replace(/[^a-zA-Z0-9_-]/g, "_")
              .toUpperCase();
            setBatchId(suggestedId);
          }

          setConfirmUploadError(null);

          // Trigger confirmation dialog with batch identifier and detected records
          setPendingUpload({
            fileName: file.name,
            students: parsedStudents,
            duplicateWarnings: Array.from(new Set(duplicateWarnings)),
          });
        }
      },
    });

    e.target.value = "";
  };

  const handleAnchorOnChain = async () => {
    if (!computedTreeData) return;
    setAnchorError(null);
    setAnchorSuccess(null);

    const trimmedBatchId = batchId.trim();
    if (!trimmedBatchId) {
      setAnchorError("Batch ID cannot be empty.");
      return;
    }

    // 1. Must be an existing persisted batch
    const persistedBatch = batches.find(
      (b) => b.batchId.trim().toLowerCase() === trimmedBatchId.toLowerCase()
    );

    if (!persistedBatch) {
      setAnchorError(
        `Batch "${trimmedBatchId}" has not been persisted to the database yet. Please click "Confirm & Upload" to save the batch to the institutional registry before anchoring.`
      );
      return;
    }

    if (persistedBatch.status === "ANCHORED") {
      setAnchorError(
        `Batch "${trimmedBatchId}" is already anchored on-chain with status ANCHORED (Tx: ${persistedBatch.txHash || "N/A"}).`
      );
      return;
    }

    setIsAnchoring(true);

    try {
      const netConfig = getNetworkConfig(selectedNetworkChainId);
      const targetAddress = netConfig.credentialRegistry;

      // 2. Pre-flight check: Verify bytecode at configured address on selected network
      const provider = getProviderForChain(selectedNetworkChainId);
      let code = "0x";
      try {
        code = await provider.getCode(targetAddress);
      } catch (rpcErr: any) {
        console.warn(`RPC getCode error on ${netConfig.name}:`, rpcErr);
      }

      if (!code || code === "0x" || code.length <= 2) {
        setAnchorError(
          `Contract Verification Blocked: No deployed smart contract bytecode exists at configured address ${targetAddress} on ${netConfig.name} (Chain ID ${selectedNetworkChainId}, bytecode length: ${code ? code.length : 0}). Anchoring transaction cannot be submitted until a valid contract is deployed.`
        );
        return;
      }

      // 3. Check for Ethereum signer (MetaMask)
      if (typeof window === "undefined" || !(window as any).ethereum) {
        setAnchorError(`MetaMask / Web3 provider is required to sign and anchor the batch transaction to ${netConfig.name}.`);
        return;
      }

      const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
      const network = await browserProvider.getNetwork();
      const connectedChainId = Number(network.chainId);
      if (connectedChainId !== selectedNetworkChainId) {
        setAnchorError(
          `MetaMask network mismatch: Portal is set to ${netConfig.name} (Chain ID: ${selectedNetworkChainId}), but MetaMask is connected to Chain ID ${connectedChainId}. Please switch your active network in MetaMask to match.`
        );
        return;
      }

      const signer = await browserProvider.getSigner().catch(() => null);
      if (!signer) {
        setAnchorError("Could not acquire signer from MetaMask. Please unlock MetaMask and authorize the transaction.");
        return;
      }

      const contract = new ethers.Contract(
        targetAddress,
        CREDENTIAL_REGISTRY_ABI,
        signer
      );

      // 4. Check if already anchored on contract
      try {
        const batchInfo = await contract.getBatchInfo(trimmedBatchId);
        if (batchInfo.exists) {
          setAnchorError(`Batch "${trimmedBatchId}" is already registered on-chain in contract ${targetAddress} on ${netConfig.name}.`);
          return;
        }
      } catch (infoErr) {
        // contract call query error, proceed with tx
      }

      const rootToAnchor = persistedBatch.merkleRoot;
      const ipfsCidToAnchor = persistedBatch.ipfsCid || `ipfs://bafybeig${rootToAnchor.slice(2, 34).toLowerCase()}`;

      // 5. Submit real on-chain transaction
      const tx = await contract.anchorMerkleRoot(trimmedBatchId, rootToAnchor, ipfsCidToAnchor);
      const receipt = await tx.wait(1);

      if (!receipt || receipt.status !== 1) {
        setAnchorError(`Transaction failed on-chain with receipt status: ${receipt?.status}`);
        return;
      }

      // 6. Update batch anchor status via PATCH /api/batches/[batchId] with expectedChainId and expectedContract
      const patchRes = await fetch(`/api/batches/${encodeURIComponent(trimmedBatchId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          txHash: receipt.hash,
          status: "ANCHORED",
          expectedChainId: selectedNetworkChainId,
          expectedContract: targetAddress,
        }),
      });

      if (!patchRes.ok) {
        const patchErr = await patchRes.json().catch(() => ({}));
        setAnchorError(
          `Batch was mined on ${selectedNetworkChainId === 31337 ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)"} (Tx: ${receipt.hash}), but updating database status returned HTTP ${patchRes.status}: ${patchErr.error || "Unknown error"}`
        );
        await loadBatches();
        return;
      }

      setAnchorSuccess({
        batchId: trimmedBatchId,
        merkleRoot: rootToAnchor,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        simulated: false,
      });

      await loadBatches();
    } catch (err: any) {
      console.error("Anchoring error:", err);
      setAnchorError(
        err?.reason ||
          err?.message ||
          `Failed to anchor batch on ${selectedNetworkChainId === 31337 ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)"}.`
      );
    } finally {
      setIsAnchoring(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!computedTreeData) return;
    setIsZipping(true);

    try {
      const b = batches.find((item) => item.batchId.trim().toLowerCase() === batchId.trim().toLowerCase());
      const isAlreadyAnchored = b?.status === "ANCHORED" && Boolean(b?.txHash);
      const netConfig = getNetworkConfig(selectedNetworkChainId);
      const credentials: W3CCredentialPayload[] = currentStudents.map((s, idx) => {
        const proofObj = {
          ...computedTreeData.proofs[idx],
          batchId,
          contractAddress: isAlreadyAnchored ? netConfig.credentialRegistry : "",
          network: isAlreadyAnchored ? netConfig.name : "Local Institutional Registry",
          ...(isAlreadyAnchored ? { chainId: selectedNetworkChainId } : {}),
        };
        return createW3CCredential(
          s,
          proofObj,
          selectedInstitution?.address || "0x8D0cC3553e9d812797B986F15427835A2930a301",
          selectedInstitution?.name || s.university,
          selectedInstitution?.code || s.institutionCode
        );
      });

      const zipBlob = await generateCredentialsZip(credentials, batchId);
      downloadFile(zipBlob, `${batchId}_verifiable_credentials.zip`, "application/zip");
    } catch (err) {
      console.error("ZIP creation error:", err);
    } finally {
      setIsZipping(false);
    }
  };

  // Filtered candidate audit rows with filter & search
  const filteredAuditRows = auditRows.filter((row) => {
    const matchesFilter = auditFilter === "ALL" || row.status === auditFilter;
    const cleanSearch = auditSearch.trim().toLowerCase();
    const matchesSearch =
      !cleanSearch ||
      row.prn.toLowerCase().includes(cleanSearch) ||
      row.claimedName.toLowerCase().includes(cleanSearch) ||
      row.onChainName.toLowerCase().includes(cleanSearch) ||
      row.flag.toLowerCase().includes(cleanSearch);
    return matchesFilter && matchesSearch;
  });



  const handleExportAuditCsv = () => {
    const csv = Papa.unparse(auditRows);
    downloadFile(csv, `Candidate_Verification_Audit_Report_${Date.now()}.csv`, "text/csv");
  };

  return (
    <div className="space-y-8 py-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                University Authority &amp; Admin Console
              </h1>
              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-bold rounded-full uppercase">
                COE Console
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Prof. V. M. Deshpande &bull; Controller of Examinations &bull; {selectedNetworkChainId === 31337 ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Blockchain Network Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setSelectedNetworkChainId(31337)}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                selectedNetworkChainId === 31337
                  ? "bg-white text-indigo-900 shadow-xs border border-indigo-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Target local Hardhat node at 127.0.0.1:8545"
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>Hardhat Local (31337)</span>
            </button>
            <button
              onClick={() => setSelectedNetworkChainId(11155111)}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                selectedNetworkChainId === 11155111
                  ? "bg-white text-blue-900 shadow-xs border border-blue-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Target Ethereum Sepolia Testnet"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Ethereum Sepolia (11155111)</span>
            </button>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl text-xs font-bold shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Active Session &bull; Authorized COE</span>
          </span>
        </div>
      </div>

      {/* Network Mismatch Alert Banner (Prominently alerts authority before anchoring) */}
      {isNetworkMismatch && (
        <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-amber-950">
                MetaMask Network Mismatch Detected
              </p>
              <p className="text-amber-800 mt-0.5">
                Your MetaMask wallet is connected to <strong>{walletNetworkName}</strong>, but this Console is set to target <strong>{selectedNetworkChainId === 31337 ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)"}</strong>.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <span className="px-3 py-1.5 bg-amber-200/90 text-amber-950 border border-amber-300 rounded-xl text-xs font-bold inline-block">
              Please switch active network in MetaMask
            </span>
          </div>
        </div>
      )}

      {/* 2 WORKSPACE TABS NAVIGATION */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab("minting")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition-all ${
            activeTab === "minting"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>1. Batch Degree Minting (OpenCerts)</span>
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition-all ${
            activeTab === "audit"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <FileCheck2 className="h-4 w-4" />
          <span>2. Bulk Candidate Audit (100+ Resumes/CGPA)</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: BATCH DEGREE MINTING WORKBENCH */}
      {/* ========================================================= */}
      {activeTab === "minting" && (
        <div className="space-y-8">
          {/* Eye-Catching Uploaded Students Records List (Prominently Placed RIGHT ABOVE MGM UNIVERSITY BAR) */}
          {currentStudents.length > 0 && (
            <div id="uploaded-student-records-section" className="animate-in fade-in duration-300">
              <UploadedStudentsList
                students={currentStudents}
                batchId={batchId}
                fileName={uploadSuccessNotification?.fileName || csvSuccess?.fileName}
              />
            </div>
          )}

          {/* Institutional Issuing Authority Node (Fixed to Authenticated University) */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Logged-in Issuing Authority
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {selectedInstitution ? selectedInstitution.name : "MGM University"}
                </span>
                <span className="text-xs text-slate-500 block">
                  {selectedInstitution ? `${selectedInstitution.city}, ${selectedInstitution.state}` : "Chhatrapati Sambhajinagar, Maharashtra"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-mono text-slate-700 font-bold flex items-center gap-1.5">
                <span className="text-slate-400 font-normal">Node Code:</span>
                <span>{selectedInstitution?.code || "MGMU-ENG-01"}</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3 py-1.5 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Authenticated Institution</span>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 1. POST-UPLOAD SUCCESS NOTIFICATION BAR (BELOW MGM UNIVERSITY CARD) */}
          {/* ========================================================= */}
          {uploadSuccessNotification && (
            <div className="bg-emerald-50/95 border-2 border-emerald-300 text-emerald-950 p-5 sm:p-6 rounded-3xl shadow-sm space-y-2.5 animate-in slide-in-from-top-3 duration-300 ring-4 ring-emerald-500/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 bg-emerald-600 text-white rounded-2xl shrink-0 mt-0.5 shadow-md shadow-emerald-600/30">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base sm:text-lg font-black text-emerald-950 tracking-tight">
                        Student Records Uploaded Successfully!
                      </h4>
                      <span className="px-3 py-0.5 bg-emerald-200/90 text-emerald-950 border border-emerald-300 rounded-full font-black text-xs font-mono shadow-2xs">
                        {uploadSuccessNotification.count} {uploadSuccessNotification.count === 1 ? "Record" : "Records"} Uploaded
                      </span>
                      <span className="font-mono text-xs font-bold text-emerald-800 bg-white px-2.5 py-0.5 rounded-lg border border-emerald-300 shadow-2xs">
                        Batch ID: {uploadSuccessNotification.batchId}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-emerald-800 font-medium leading-relaxed">
                      The student records have been successfully uploaded and processed for the selected graduation batch.
                    </p>
                    {uploadSuccessNotification.fileName && (
                      <p className="text-[11px] text-emerald-700 font-mono">
                        Source: {uploadSuccessNotification.fileName} &bull; Cryptographic Merkle DAG synchronized and ready for on-chain anchoring.
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setUploadSuccessNotification(null)}
                  className="self-end sm:self-center p-2 rounded-xl text-emerald-700 hover:text-emerald-950 hover:bg-emerald-200/60 transition-colors cursor-pointer shrink-0"
                  title="Dismiss success notification"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* Minting Grid: CSV Upload + Merkle Root Anchor */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Upload & Parameters */}
            <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-blue-600" />
                <span>Batch Parameters</span>
              </h2>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Batch Identifier:
                </label>
                <input
                  type="text"
                  value={batchId}
                  placeholder="e.g. MGM-2026-BTECH-BATCH01"
                  onChange={(e) => {
                    setBatchId(e.target.value);
                    setAnchorError(null);
                  }}
                  className={`w-full bg-slate-50 border ${
                    batchId.trim() !== "" && batches.some((b) => b.batchId.trim().toLowerCase() === batchId.trim().toLowerCase())
                      ? "border-amber-400 focus:border-amber-500"
                      : "border-slate-300"
                  } rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-hidden`}
                />
                {batchId.trim() !== "" && batches.some((b) => b.batchId.trim().toLowerCase() === batchId.trim().toLowerCase()) && (
                  <p className="text-[10px] text-amber-700 font-semibold mt-1">
                    ⚠️ Note: A batch with this ID already exists in the registry.
                  </p>
                )}
              </div>

              {/* CSV Upload Dropzone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Graduation Batch CSV:
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center cursor-pointer bg-slate-50/50 hover:bg-blue-50/30 transition-all"
                >
                  <FileSpreadsheet className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">Click to Upload Student CSV</p>
                  <p className="text-[11px] text-slate-400 mt-1">PRN, Name, Major, CGPA, Credits</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleCsvUpload}
                    accept=".csv"
                    className="hidden"
                  />
                </div>

                {/* Per-Row CSV Errors */}
                {csvErrors.length > 0 && (
                  <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-2xl space-y-2 text-left animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 text-xs font-bold text-red-900">
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                      <span>
                        CSV Validation Failed ({csvErrors.length} row{csvErrors.length > 1 ? "s" : ""} invalid)
                      </span>
                    </div>
                    <p className="text-[11px] text-red-700 leading-relaxed">
                      Anchoring is disabled until all invalid rows are resolved. No fabricated or placeholder values are permitted.
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-2 pt-1 divide-y divide-red-200/60 pr-1">
                      {csvErrors.map((err, idx) => (
                        <div key={idx} className="pt-2 text-[11px] text-red-800">
                          <span className="font-bold text-red-950">
                            Row {err.rowNumber} ({err.prn}):
                          </span>
                          <ul className="list-disc list-inside ml-2 mt-0.5 space-y-0.5 text-red-700">
                            {err.errors.map((e, eIdx) => (
                              <li key={eIdx}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sample Batch Buttons */}
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-bold text-slate-500 block">Or Load Preset Batch:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setCsvErrors([]);
                      setCsvSuccess(null);
                      setAnchorError(null);
                      setCurrentStudents(INITIAL_STUDENTS_MGM);
                      setBatchId("MGM-2024-BTECH-BATCH01");
                      recalculateTree(INITIAL_STUDENTS_MGM);
                      setUploadSuccessNotification({
                        batchId: "MGM-2024-BTECH-BATCH01",
                        count: INITIAL_STUDENTS_MGM.length,
                        fileName: "Preset Batch: MGM CSE (Batch 01)",
                        timestamp: Date.now(),
                      });
                    }}
                    className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-[11px] font-bold"
                  >
                    MGM CSE (Batch 01)
                  </button>
                  <button
                    onClick={() => {
                      setCsvErrors([]);
                      setCsvSuccess(null);
                      setAnchorError(null);
                      setCurrentStudents(INITIAL_STUDENTS_MGM);
                      setBatchId("MGM-2024-BTECH-BATCH02");
                      recalculateTree(INITIAL_STUDENTS_MGM);
                      setUploadSuccessNotification({
                        batchId: "MGM-2024-BTECH-BATCH02",
                        count: INITIAL_STUDENTS_MGM.length,
                        fileName: "Preset Batch: MGM IT & ECE (Batch 02)",
                        timestamp: Date.now(),
                      });
                    }}
                    className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold"
                  >
                    MGM IT &amp; ECE (Batch 02)
                  </button>
                </div>

                {/* Manual Add Student Button */}
                <button
                  type="button"
                  onClick={() => setIsAddStudentModalOpen(true)}
                  className="w-full mt-2 py-2.5 px-3 bg-white hover:bg-blue-50/60 text-blue-700 hover:text-blue-800 border border-blue-200 hover:border-blue-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer active:scale-[0.99]"
                >
                  <UserPlus className="h-4 w-4 text-blue-600" />
                  <span>Manually Add Student Record</span>
                </button>
              </div>
            </div>

            {/* Merkle Calculation & Actions */}
            <div className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    O(1) Merkle DAG Computation
                  </h2>
                  <p className="text-xs text-slate-500">
                    {currentStudents.length > 0
                      ? `Calculated for ${currentStudents.length} graduation candidates`
                      : "No graduation candidates staged for Merkle computation"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {batchId.trim() !== "" && (() => {
                    const b = batches.find((item) => item.batchId.trim().toLowerCase() === batchId.trim().toLowerCase());
                    return b ? renderBatchStatusBadge(b.status, b.txHash, b.isVerifiedOnChain) : null;
                  })()}
                  <div className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold font-mono">
                    Constant O(1) Gas
                  </div>
                </div>
              </div>

              {/* Merkle Root Box */}
              {computedTreeData ? (
                <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2 font-mono text-xs shadow-inner">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>32-Byte Merkle Root (Keccak-256):</span>
                    <span className="text-emerald-400 font-bold">DPDP Zero-PII</span>
                  </div>
                  <div className="text-blue-300 font-bold break-all text-sm sm:text-base">
                    {computedTreeData.root}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 text-xs flex items-center justify-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-slate-400" />
                  <span>No student records loaded. Upload a graduation CSV to compute the Merkle DAG.</span>
                </div>
              )}

              {/* Academic Governance Quorum Checkpoint */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                    <span>Examination Board Approval Workflow (UI Simulation Preview)</span>
                  </span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                    UI Simulation Preview
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 italic">
                  Administrative workflow preview: on-chain multi-signature smart contract not active.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-800 block">Exam Cell Desk</span>
                      <span className="text-[10px] text-slate-500 font-mono">Gazette Reconciled</span>
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-800 block">Academic Dean</span>
                      <span className="text-[10px] text-slate-500 font-mono">NEP Credits Audited</span>
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-800 block">Controller of Exams</span>
                      <span className="text-[10px] text-slate-500 font-mono">Institutional Approval Staged (Simulation)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {(() => {
                  const b = batches.find((item) => item.batchId.trim().toLowerCase() === batchId.trim().toLowerCase());
                  const isAlreadyAnchored = b?.status === "ANCHORED";
                  return (
                    <button
                      onClick={handleAnchorOnChain}
                      disabled={isAnchoring || !computedTreeData || csvErrors.length > 0 || currentStudents.length === 0 || isAlreadyAnchored}
                      className={`py-3.5 ${
                        isAlreadyAnchored
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-default"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      } rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50`}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>
                        {isAnchoring
                          ? "Verifying & Anchoring..."
                          : isAlreadyAnchored
                          ? "Batch Anchored on-chain"
                          : `Anchor Root to ${selectedNetworkChainId === 31337 ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)"}`}
                      </span>
                    </button>
                  );
                })()}

                <button
                  onClick={handleDownloadZip}
                  disabled={isZipping || !computedTreeData || csvErrors.length > 0 || currentStudents.length === 0}
                  className="py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <Download className="h-4 w-4 text-blue-600" />
                  <span>{isZipping ? "Generating ZIP..." : "Download Student JSONs (.zip)"}</span>
                </button>
              </div>

              {anchorError && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-900 rounded-2xl space-y-1.5 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 font-bold text-sm text-red-900">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                    <span>Anchoring Blocked</span>
                  </div>
                  <p className="text-[11px] text-red-700 leading-relaxed font-mono">
                    {anchorError}
                  </p>
                </div>
              )}

              {anchorSuccess && (
                <div
                  className={`p-4 ${
                    anchorSuccess.simulated
                      ? "bg-amber-50 border-amber-300 text-amber-900"
                      : "bg-emerald-50 border-emerald-200 text-emerald-900"
                  } border rounded-2xl space-y-1.5 text-xs`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <CheckCircle2
                        className={`h-4 w-4 ${
                          anchorSuccess.simulated ? "text-amber-600" : "text-emerald-600"
                        }`}
                      />
                      <span>
                        {anchorSuccess.simulated
                          ? "Batch Anchored Locally (Simulated Mode)"
                          : `Batch Successfully Anchored on ${selectedNetworkChainId === 31337 ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)"}!`}
                      </span>
                    </div>
                    {anchorSuccess.simulated ? (
                      <span className="px-2.5 py-1 bg-amber-200/90 text-amber-900 border border-amber-300 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
                        Simulated — not on-chain
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-emerald-200/90 text-emerald-900 border border-emerald-300 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
                        Live On-Chain
                      </span>
                    )}
                  </div>
                  <p
                    className={`font-mono text-[11px] ${
                      anchorSuccess.simulated ? "text-amber-800" : "text-emerald-800"
                    } truncate`}
                  >
                    Tx Hash: {anchorSuccess.txHash}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Merkle Visualizer */}
          {computedTreeData && (
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                Interactive Merkle DAG Visualization
              </h3>
              <MerkleTreeVisualizer
                rootHash={computedTreeData.rootHex || computedTreeData.root}
                records={currentStudents}
                proofs={computedTreeData.proofs}
              />
            </div>
          )}

          {/* Stored Batches & Bitmap Revocation Management */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600" />
              <span>Registered Academic Batches ({batches.length})</span>
            </h3>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="p-3.5">Batch Identifier</th>
                    <th className="p-3.5">University</th>
                    <th className="p-3.5">Degrees</th>
                    <th className="p-3.5">Merkle Root</th>
                    <th className="p-3.5">Lifecycle Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((batch) => (
                    <tr key={batch.batchId} className="hover:bg-slate-50">
                      <td className="p-3.5 font-bold text-slate-900">
                        <div>{batch.batchId}</div>
                        {batch.txHash && batch.status === "ANCHORED" && batch.isVerifiedOnChain !== false && (
                          selectedNetworkChainId === 11155111 ? (
                            <a
                              href={`https://sepolia.etherscan.io/tx/${batch.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline font-mono mt-0.5"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                              <span>{batch.txHash.slice(0, 10)}... (Ethereum Sepolia)</span>
                            </a>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] text-indigo-700 font-mono mt-0.5"
                              title={`Local Hardhat Tx: ${batch.txHash}`}
                            >
                              <Cpu className="h-2.5 w-2.5" />
                              <span>{batch.txHash.slice(0, 10)}... (Hardhat Local)</span>
                            </span>
                          )
                        )}
                      </td>
                      <td className="p-3.5 text-slate-600">{batch.institutionName || "MGM University"}</td>
                      <td className="p-3.5 font-mono">{batch.totalCredentials || batch.records?.length || 0}</td>
                      <td className="p-3.5 font-mono text-slate-500 truncate max-w-[140px]" title={batch.merkleRoot}>
                        {batch.merkleRoot}
                      </td>
                      <td className="p-3.5">{renderBatchStatusBadge(batch.status, batch.txHash, batch.isVerifiedOnChain, selectedNetworkChainId)}</td>
                      <td className="p-3.5 text-right space-x-2">
                        {batch.records && batch.records.length > 0 && (
                          <button
                            onClick={() => {
                              setBatchId(batch.batchId);
                              setCurrentStudents(batch.records);
                              recalculateTree(batch.records);
                              setUploadSuccessNotification(null);
                              setAnchorError(null);
                              setAnchorSuccess(null);
                            }}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all"
                            title="Load batch into workbench"
                          >
                            Load
                          </button>
                        )}
                        <button
                          onClick={() => setRevocationModalBatch(batch)}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all"
                        >
                          Manage Revocations
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: BULK CANDIDATE AUDIT (100+ CANDIDATES) */}
      {/* ========================================================= */}
      {activeTab === "audit" && (
        <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">
                  High-Throughput Candidate Verification Matrix
                </h2>
                <p className="text-xs text-slate-500">
                  Batch audit candidate CGPAs and claimed credentials against on-chain Ethereum Merkle records.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportAuditCsv}
                  disabled={auditRows.length === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export Audit CSV Report</span>
                </button>
              </div>
            </div>

            {/* Toolbar: Filters + Search Box */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-500 mr-1">Filter Matrix:</span>
                <button
                  onClick={() => setAuditFilter("ALL")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    auditFilter === "ALL"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  All Candidates ({auditRows.length})
                </button>

                <button
                  onClick={() => setAuditFilter("AUTHENTIC")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    auditFilter === "AUTHENTIC"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  }`}
                >
                  Authentic Match ({auditRows.filter((r) => r.status === "AUTHENTIC").length})
                </button>

                <button
                  onClick={() => setAuditFilter("DISCREPANCY")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    auditFilter === "DISCREPANCY"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 text-amber-900 hover:bg-amber-100"
                  }`}
                >
                  CGPA Discrepancies ({auditRows.filter((r) => r.status === "DISCREPANCY").length})
                </button>

                <button
                  onClick={() => setAuditFilter("UNREGISTERED")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    auditFilter === "UNREGISTERED"
                      ? "bg-red-600 text-white shadow-xs"
                      : "bg-red-50 text-red-800 hover:bg-red-100"
                  }`}
                >
                  Forged / Unregistered ({auditRows.filter((r) => r.status === "UNREGISTERED").length})
                </button>
              </div>

              {/* Live Search Box */}
              <div className="relative min-w-[260px]">
                <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Search candidate name or PRN..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 font-medium"
                />
              </div>
            </div>

            {/* Discrepancy Matrix Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="p-3.5">Candidate PRN</th>
                    <th className="p-3.5">Claimed Name</th>
                    <th className="p-3.5">Claimed CGPA</th>
                    <th className="p-3.5">Recorded CGPA</th>
                    <th className="p-3.5">Issuing University</th>
                    <th className="p-3.5">Cryptographic Audit Finding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <FileCheck2 className="h-8 w-8 text-slate-300" />
                          <p className="font-bold text-slate-700 text-xs">
                            {auditRows.length === 0
                              ? "No candidate audit records available"
                              : "No candidate records match the selected filter criteria"}
                          </p>
                          <p className="text-[11px] text-slate-400 max-w-md">
                            {auditRows.length === 0
                              ? "Upload and process a student graduation batch in Tab 1 to populate the on-chain audit matrix."
                              : "Try switching the filter matrix or clearing your search query."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAuditRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={
                          row.status === "DISCREPANCY"
                            ? "bg-amber-50/60"
                            : row.status === "UNREGISTERED"
                            ? "bg-red-50/60"
                            : "hover:bg-slate-50"
                        }
                      >
                        <td className="p-3.5 font-mono font-bold text-slate-900">{row.prn}</td>
                        <td className="p-3.5 font-medium">{row.claimedName}</td>
                        <td className="p-3.5 font-mono font-bold">{row.claimedCgpa.toFixed(2)}</td>
                        <td className="p-3.5 font-mono font-bold">
                          {row.onChainCgpa > 0 ? row.onChainCgpa.toFixed(2) : "—"}
                        </td>
                        <td className="p-3.5 text-slate-600">{row.onChainUniversity}</td>
                        <td className="p-3.5">
                          {row.status === "AUTHENTIC" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-900 font-bold rounded-lg text-[11px]">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{row.flag}</span>
                            </span>
                          )}
                          {row.status === "DISCREPANCY" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-900 font-bold rounded-lg text-[11px]">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                              <span>{row.flag}</span>
                            </span>
                          )}
                          {row.status === "UNREGISTERED" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-900 font-bold rounded-lg text-[11px]">
                              <XCircle className="h-3.5 w-3.5 text-red-600" />
                              <span>{row.flag}</span>
                            </span>
                          )}
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* Revocation Modal */}
      {revocationModalBatch && (
        <BatchRevocationModal
          isOpen={!!revocationModalBatch}
          onClose={() => {
            setRevocationModalBatch(null);
            loadBatches();
          }}
          onRevokedSuccess={() => {
            setRevocationModalBatch(null);
            loadBatches();
          }}
          batch={revocationModalBatch}
        />
      )}

      {/* Manual Student Entry Modal */}
      <AddStudentModal
        isOpen={isAddStudentModalOpen}
        onClose={() => setIsAddStudentModalOpen(false)}
        currentCount={currentStudents.length}
        institutionName={selectedInstitution?.name || "MGM University, Chhatrapati Sambhajinagar"}
        institutionCode={selectedInstitution?.code || "MGMU-ENG-01"}
        existingPrns={currentStudents.map((s) => s.prn)}
        onAddStudent={handleAddManualStudent}
      />

      {/* Upload Confirmation Dialog / Bar */}
      {pendingUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative bg-white w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-5 text-center animate-in zoom-in-95 duration-200 text-slate-900">
            {/* Top Glowing Alert Icon */}
            <div className="relative mx-auto w-16 h-16 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/30 ring-8 ring-blue-50">
              <FileSpreadsheet className="h-8 w-8" />
            </div>

            {/* Header Text */}
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-900 border border-blue-200 rounded-full text-xs font-extrabold tracking-wide uppercase">
                Action Confirmation Required
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Confirm Student Records Upload
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-sm mx-auto leading-relaxed">
                Are you sure you want to upload these student records and proceed with credential issuance?
              </p>
            </div>

            {/* Batch Details Card */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-2.5 text-xs shadow-inner">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500 font-semibold">Batch ID:</span>
                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs">
                  {batchId}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                  <FileSpreadsheet className="h-4 w-4 text-slate-400" />
                  {pendingUpload.fileName.startsWith("Manual") ? "Candidate Source:" : "Selected CSV File:"}
                </span>
                <span className="font-mono font-bold text-slate-900 truncate max-w-[210px] bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs" title={pendingUpload.fileName}>
                  {pendingUpload.fileName}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500 font-semibold">Total Valid Records Detected:</span>
                <span className="font-extrabold text-emerald-950 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full text-xs flex items-center gap-1 shadow-2xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {pendingUpload.students.length} Valid {pendingUpload.students.length === 1 ? "Record" : "Records"}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500 font-semibold">Duplicate / Invalid Records:</span>
                <span className={`font-bold px-2.5 py-0.5 rounded-lg border text-xs ${
                  pendingUpload.duplicateWarnings && pendingUpload.duplicateWarnings.length > 0
                    ? "bg-amber-100 text-amber-900 border-amber-300 font-mono"
                    : "bg-slate-100 text-slate-600 border-slate-200 font-mono"
                }`}>
                  {pendingUpload.duplicateWarnings?.length || 0}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500 font-semibold">Consortium Authority:</span>
                <span className="font-bold text-slate-800">
                  {selectedInstitution?.name || "MGM University"}
                </span>
              </div>
            </div>

            {/* Duplicate / Invalid Warnings (if any) */}
            {pendingUpload.duplicateWarnings && pendingUpload.duplicateWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-left space-y-1.5 text-xs animate-in fade-in">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Duplicate PRN Warning Detected ({pendingUpload.duplicateWarnings.length}):</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-amber-800 text-[11px] max-h-24 overflow-y-auto pl-1">
                  {pendingUpload.duplicateWarnings.map((warn, wIdx) => (
                    <li key={wIdx}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Confirm & Upload Error Notice */}
            {confirmUploadError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-900 text-xs flex items-start gap-2 text-left font-semibold animate-in fade-in">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{confirmUploadError}</span>
              </div>
            )}

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Confirming will persist this academic batch to the institutional SQLite database with status <span className="font-mono font-bold text-slate-800">PENDING_ANCHOR</span> and compute the 32-byte cryptographic Merkle root. Blockchain anchoring to {selectedNetworkChainId === 31337 ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)"} remains a separate step.
            </p>

            {/* Action Buttons: Cancel vs Confirm & Upload */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPendingUpload(null);
                  setConfirmUploadError(null);
                }}
                disabled={isConfirmingUpload}
                className="w-full sm:w-1/2 py-3 px-5 rounded-2xl border-2 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100 text-slate-700 font-bold text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
              >
                <XCircle className="h-4 w-4 text-slate-500" />
                <span>Cancel</span>
              </button>
              <button
                type="button"
                disabled={isConfirmingUpload}
                onClick={async () => {
                  if (!pendingUpload || isConfirmingUpload) return;
                  setIsConfirmingUpload(true);
                  setConfirmUploadError(null);
                  try {
                    const trimmedBatchId = batchId.trim();
                    if (!trimmedBatchId) {
                      setConfirmUploadError("Batch identifier cannot be empty. Please enter a valid Batch ID.");
                      return;
                    }

                    const uploadedCount = pendingUpload.students.length;
                    const sourceFileName = pendingUpload.fileName;

                    // Compute Merkle tree from staged students
                    const treeData = buildBatchMerkleTree(pendingUpload.students);
                    const rootHex = treeData.rootHex;
                    const institutionName = selectedInstitution?.name || "MGM University";
                    const institutionCode = selectedInstitution?.code || "MGMU-ENG-01";
                    const issuerAddress = selectedInstitution?.address || "0x8D0cC3553e9d812797B986F15427835A2930a301";

                    const payload = {
                      batchId: trimmedBatchId,
                      merkleRoot: rootHex,
                      ipfsCid: "",
                      status: "PENDING_ANCHOR" as BatchStatus,
                      timestamp: Math.floor(Date.now() / 1000),
                      issuer: issuerAddress,
                      institutionName,
                      institutionCode,
                      totalCredentials: uploadedCount,
                      revokedIndices: [],
                      records: pendingUpload.students,
                    };

                    const res = await fetch("/api/batches", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify(payload),
                    });

                    if (res.status === 401) {
                      setConfirmUploadError("Unauthorized (401): Valid Examination Authority session required. Please sign in again.");
                      return;
                    }

                    if (res.status === 409) {
                      const errJson = await res.json().catch(() => ({}));
                      setConfirmUploadError(
                        errJson.error || `Batch ID conflict: Batch "${trimmedBatchId}" already exists with different contents.`
                      );
                      return;
                    }

                    if (!res.ok) {
                      const errJson = await res.json().catch(() => ({}));
                      setConfirmUploadError(
                        errJson.error || `Failed to persist batch to database (HTTP ${res.status}).`
                      );
                      return;
                    }

                    // Success (HTTP 200 or 201)
                    setCsvErrors([]);
                    setCsvSuccess({
                      fileName: sourceFileName,
                      count: uploadedCount,
                    });
                    setCurrentStudents(pendingUpload.students);
                    setComputedTreeData(treeData);

                    // Sync uploaded students into the bulk candidate audit table
                    const newAuditEntries: CandidateAuditRecord[] = pendingUpload.students.map((s) => ({
                      prn: s.prn,
                      claimedName: s.fullName,
                      claimedCgpa: s.cgpa,
                      onChainName: s.fullName,
                      onChainCgpa: s.cgpa,
                      onChainUniversity: s.university || institutionName,
                      status: "AUTHENTIC",
                      flag: "Exact On-Chain Match",
                    }));
                    setAuditRows((prev) => {
                      const existingPrns = new Set(newAuditEntries.map((e) => e.prn));
                      return [...newAuditEntries, ...prev.filter((r) => !existingPrns.has(r.prn))];
                    });

                    // Trigger Post-Upload Success Notification Bar
                    setUploadSuccessNotification({
                      batchId: trimmedBatchId,
                      count: uploadedCount,
                      fileName: sourceFileName,
                      timestamp: Date.now(),
                    });

                    setAnchorSuccess(null);
                    setConfirmUploadError(null);
                    setPendingUpload(null);

                    // Refresh batches list from SQLite backend
                    await loadBatches();
                  } catch (err: any) {
                    console.error("Confirm & Upload error:", err);
                    setConfirmUploadError(err?.message || "Failed to persist batch to SQLite database.");
                  } finally {
                    setIsConfirmingUpload(false);
                  }
                }}
                className="w-full sm:w-1/2 py-3 px-5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConfirmingUpload ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Uploading Records...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    <span>Confirm &amp; Upload</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
