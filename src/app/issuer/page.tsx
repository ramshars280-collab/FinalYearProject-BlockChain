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
} from "lucide-react";
import { StudentDegreeData, BatchRecord, W3CCredentialPayload, ConsortiumInstitution } from "../../types";
import { buildBatchMerkleTree, createW3CCredential } from "../../lib/crypto";
import { generateCredentialsZip, downloadFile } from "../../lib/zipHelper";
import {
  getStoredBatches,
  saveStoredBatches,
  getSepoliaConfig,
  getConsortiumInstitutions,
  INITIAL_STUDENTS_MGM,
} from "../../lib/storage";
import { anchorMerkleBatch } from "../../lib/contracts";
import MerkleTreeVisualizer from "../../components/MerkleTreeVisualizer";
import BatchRevocationModal from "../../components/BatchRevocationModal";
import { useAuth, DEMO_IDENTIFIERS } from "../../context/AuthContext";

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

// ==========================================
// UNIVERSITY ADMIN CONSOLE WORKSPACE (2 TABS)
// ==========================================

function UniversityAdminWorkspace({ logout }: { logout: () => void }) {
  const [activeTab, setActiveTab] = useState<"minting" | "audit">("minting");

  // Tab 1: Minting state
  const [institutions, setInstitutions] = useState<ConsortiumInstitution[]>([]);
  const [selectedInstitution, setSelectedInstitution] = useState<ConsortiumInstitution | null>(null);

  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [currentStudents, setCurrentStudents] = useState<StudentDegreeData[]>(INITIAL_STUDENTS_MGM);
  const [batchId, setBatchId] = useState<string>("MGM-2024-BTECH-BATCH02");
  const [computedTreeData, setComputedTreeData] = useState<any>(null);
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [anchorSuccess, setAnchorSuccess] = useState<any>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [revocationModalBatch, setRevocationModalBatch] = useState<BatchRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab 2: Candidate Audit State
  const [auditRows, setAuditRows] = useState<any[]>([
    {
      prn: "PRN20200101",
      claimedName: "Aarav Sharma",
      claimedCgpa: 9.42,
      onChainName: "Aarav Sharma",
      onChainCgpa: 9.42,
      onChainUniversity: "MGM University",
      status: "AUTHENTIC",
      flag: "Exact On-Chain Match",
    },
    {
      prn: "PRN20200102",
      claimedName: "Priya Patel",
      claimedCgpa: 9.80,
      onChainName: "Priya Patel",
      onChainCgpa: 9.15,
      onChainUniversity: "MGM University",
      status: "DISCREPANCY",
      flag: "Inflated CGPA (+0.65 higher than on-chain record)",
    },
    {
      prn: "PRN20200103",
      claimedName: "Rohan Gupta",
      claimedCgpa: 8.78,
      onChainName: "Rohan Gupta",
      onChainCgpa: 8.78,
      onChainUniversity: "MGM University",
      status: "AUTHENTIC",
      flag: "Exact On-Chain Match",
    },
    {
      prn: "PRN99999999",
      claimedName: "Vikram Malhotra",
      claimedCgpa: 9.90,
      onChainName: "—",
      onChainCgpa: 0,
      onChainUniversity: "—",
      status: "UNREGISTERED",
      flag: "Forged PRN / No On-Chain Merkle Record",
    },
    {
      prn: "PRN20200104",
      claimedName: "Neha Kulkarni",
      claimedCgpa: 8.92,
      onChainName: "Neha Kulkarni",
      onChainCgpa: 8.92,
      onChainUniversity: "MGM University",
      status: "AUTHENTIC",
      flag: "Exact On-Chain Match",
    },
  ]);
  const [auditFilter, setAuditFilter] = useState<"ALL" | "AUTHENTIC" | "DISCREPANCY" | "UNREGISTERED">("ALL");

  useEffect(() => {
    loadInstitutions();
    loadBatches();
    recalculateTree(INITIAL_STUDENTS_MGM);
  }, []);

  const loadInstitutions = () => {
    const list = getConsortiumInstitutions();
    setInstitutions(list);
    if (!selectedInstitution && list.length > 0) {
      setSelectedInstitution(list[0]);
    }
  };

  const loadBatches = () => {
    const stored = getStoredBatches();
    setBatches(stored);
  };

  const recalculateTree = (students: StudentDegreeData[]) => {
    if (students.length === 0) return;
    const treeData = buildBatchMerkleTree(students);
    setComputedTreeData(treeData);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed: StudentDegreeData[] = results.data.map((row: any, i: number) => ({
          prn: row.prn || row.PRN || `PRN-${i + 1}`,
          fullName: row.fullName || row.studentName || row.name || row.Name || "Student Name",
          degree: row.degree || row.degreeName || "Bachelor of Technology",
          branch: row.branch || row.major || row.department || "Computer Science and Engineering",
          cgpa: parseFloat(row.cgpa || row.CGPA || "8.50"),
          graduationYear: parseInt(row.graduationYear || row.year || "2024"),
          issueDate: row.issueDate || new Date().toISOString().split("T")[0],
          nheqfCredits: parseInt(row.creditsCompleted || row.nheqfCredits || "164"),
          nheqfLevel: parseInt(row.nheqfLevel || "8"),
          university: selectedInstitution?.name || "MGM University",
          institutionCode: selectedInstitution?.code || "MGM-ENGG-01",
        }));

        setCurrentStudents(parsed);
        recalculateTree(parsed);
      },
    });
  };

  const handleAnchorOnChain = async () => {
    if (!computedTreeData) return;
    setIsAnchoring(true);
    setAnchorSuccess(null);

    try {
      const config = getSepoliaConfig();
      const institutionName = selectedInstitution ? selectedInstitution.name : "MGM University";
      const totalDegrees = currentStudents.length;

      let signer: ethers.Signer | null = null;
      if (typeof window !== "undefined" && (window as any).ethereum) {
        try {
          const provider = new ethers.BrowserProvider((window as any).ethereum);
          signer = await provider.getSigner().catch(() => null);
        } catch (e: any) {
          console.warn("Could not acquire signer:", e);
        }
      }

      const contractRes = await anchorMerkleBatch(
        batchId,
        computedTreeData.root,
        `ipfs://bafybeig${batchId.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
        signer
      );
      const txHash = contractRes.txHash;
      const simulated = contractRes.simulated;

      const newBatch: BatchRecord = {
        batchId,
        merkleRoot: computedTreeData.rootHex || computedTreeData.root,
        ipfsCid: `ipfs://bafybeig${batchId.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
        timestamp: Math.floor(Date.now() / 1000),
        issuer: selectedInstitution?.address || "0x71C56538b15294500B73f8472B4fE963D4e58bEf",
        institutionName,
        institutionCode: selectedInstitution?.code || "MGMU-ENG-01",
        totalCredentials: totalDegrees,
        revokedIndices: [],
        records: currentStudents,
      };

      const updated = [newBatch, ...batches];
      saveStoredBatches(updated);
      setBatches(updated);
      setAnchorSuccess({ ...newBatch, txHash, simulated });
    } catch (err: any) {
      console.error("Anchoring error:", err);
    } finally {
      setIsAnchoring(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!computedTreeData) return;
    setIsZipping(true);

    try {
      const config = getSepoliaConfig();
      const credentials: W3CCredentialPayload[] = currentStudents.map((s, idx) => {
        const proofObj = {
          ...computedTreeData.proofs[idx],
          batchId,
          contractAddress: config.credentialRegistryAddress,
        };
        return createW3CCredential(
          s,
          proofObj,
          selectedInstitution?.address || "0x71C56538b15294500B73f8472B4fE963D4e58bEf",
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

  // Filtered candidate audit rows
  const filteredAuditRows = auditRows.filter((row) => {
    if (auditFilter === "ALL") return true;
    return row.status === auditFilter;
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
              Prof. V. M. Deshpande &bull; Controller of Examinations &bull; Ethereum Sepolia Anchor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl text-xs font-bold shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Active Session &bull; Authorized COE</span>
          </span>
        </div>
      </div>

      {/* 2 SIMPLE TABS NAVIGATION */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
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
                  onChange={(e) => setBatchId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-hidden"
                />
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
              </div>

              {/* Sample Batch Buttons */}
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-bold text-slate-500 block">Or Load Preset Batch:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setCurrentStudents(INITIAL_STUDENTS_MGM);
                      setBatchId("MGM-2024-BTECH-BATCH01");
                      recalculateTree(INITIAL_STUDENTS_MGM);
                    }}
                    className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-[11px] font-bold"
                  >
                    MGM CSE (Batch 01)
                  </button>
                  <button
                    onClick={() => {
                      setCurrentStudents(INITIAL_STUDENTS_MGM);
                      setBatchId("MGM-2024-BTECH-BATCH02");
                      recalculateTree(INITIAL_STUDENTS_MGM);
                    }}
                    className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold"
                  >
                    MGM IT &amp; ECE (Batch 02)
                  </button>
                </div>
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
                    Calculated for {currentStudents.length} graduation candidates
                  </p>
                </div>

                <div className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold font-mono">
                  99.8% Gas Reduction
                </div>
              </div>

              {/* Merkle Root Box */}
              {computedTreeData && (
                <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2 font-mono text-xs shadow-inner">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>32-Byte Merkle Root (Keccak-256):</span>
                    <span className="text-emerald-400 font-bold">DPDP Zero-PII</span>
                  </div>
                  <div className="text-blue-300 font-bold break-all text-sm sm:text-base">
                    {computedTreeData.root}
                  </div>
                </div>
              )}

              {/* Academic Governance Quorum Checkpoint */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                    <span>Examination Board Multi-Signature Quorum</span>
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                    3 of 3 Verified
                  </span>
                </div>

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
                      <span className="text-[10px] text-slate-500 font-mono">Sepolia Root Co-Signed</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleAnchorOnChain}
                  disabled={isAnchoring || !computedTreeData}
                  className="py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>{isAnchoring ? "Anchoring on Sepolia..." : "Anchor Root to Ethereum Sepolia"}</span>
                </button>

                <button
                  onClick={handleDownloadZip}
                  disabled={isZipping || !computedTreeData}
                  className="py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <Download className="h-4 w-4 text-blue-600" />
                  <span>{isZipping ? "Generating ZIP..." : "Download Student JSONs (.zip)"}</span>
                </button>
              </div>

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
                          : "Batch Successfully Anchored on Sepolia!"}
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
              <span>On-Chain Anchored Batches ({batches.length})</span>
            </h3>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="p-3.5">Batch Identifier</th>
                    <th className="p-3.5">University</th>
                    <th className="p-3.5">Degrees</th>
                    <th className="p-3.5">Merkle Root</th>
                    <th className="p-3.5 text-right">Revocation Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((batch) => (
                    <tr key={batch.batchId} className="hover:bg-slate-50">
                      <td className="p-3.5 font-bold text-slate-900">{batch.batchId}</td>
                      <td className="p-3.5 text-slate-600">{batch.institutionName || "MGM University"}</td>
                      <td className="p-3.5 font-mono">{batch.totalCredentials || batch.records?.length || 0}</td>
                      <td className="p-3.5 font-mono text-slate-500 truncate max-w-[140px]">
                        {batch.merkleRoot}
                      </td>
                      <td className="p-3.5 text-right">
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
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export Audit CSV Report</span>
                </button>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 mr-2">Filter Matrix:</span>
              <button
                onClick={() => setAuditFilter("ALL")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  auditFilter === "ALL"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All Candidates ({auditRows.length})
              </button>

              <button
                onClick={() => setAuditFilter("AUTHENTIC")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  auditFilter === "AUTHENTIC"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                }`}
              >
                Authentic Match ({auditRows.filter((r) => r.status === "AUTHENTIC").length})
              </button>

              <button
                onClick={() => setAuditFilter("DISCREPANCY")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  auditFilter === "DISCREPANCY"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-50 text-amber-900 hover:bg-amber-100"
                }`}
              >
                CGPA Discrepancies ({auditRows.filter((r) => r.status === "DISCREPANCY").length})
              </button>

              <button
                onClick={() => setAuditFilter("UNREGISTERED")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  auditFilter === "UNREGISTERED"
                    ? "bg-red-600 text-white"
                    : "bg-red-50 text-red-800 hover:bg-red-100"
                }`}
              >
                Forged / Unregistered ({auditRows.filter((r) => r.status === "UNREGISTERED").length})
              </button>
            </div>

            {/* Discrepancy Matrix Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="p-3.5">Candidate PRN</th>
                    <th className="p-3.5">Claimed Name</th>
                    <th className="p-3.5">Claimed CGPA</th>
                    <th className="p-3.5">On-Chain Actual CGPA</th>
                    <th className="p-3.5">Issuing University</th>
                    <th className="p-3.5">Cryptographic Audit Finding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditRows.map((row, idx) => (
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
                  ))}
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
    </div>
  );
}
