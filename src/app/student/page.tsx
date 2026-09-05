"use client";

import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UserCheck,
  Wallet,
  ShieldCheck,
  KeyRound,
  Download,
  QrCode,
  Sparkles,
  Award,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  FileCheck,
  Eye,
  EyeOff,
  Lock,
  Cpu,
  Fingerprint,
  Layers,
  LogOut,
  User,
  ShieldAlert,
  Share2,
  Check,
} from "lucide-react";
import QRCode from "qrcode";
import {
  getStoredIdentities,
  saveIdentityBinding,
  getStoredBatches,
  getSepoliaConfig,
} from "../../lib/storage";
import { signIdentityBinding, verifyIdentityBindingSignature } from "../../lib/eip712";
import { createW3CCredential, buildBatchMerkleTree } from "../../lib/crypto";
import { downloadFile } from "../../lib/zipHelper";
import { W3CCredentialPayload, StudentDegreeData, BatchRecord } from "../../types";
import ZkProofModal from "../../components/ZkProofModal";
import DegreeCertificate from "../../components/DegreeCertificate";
import InteractiveHologramCard from "../../components/InteractiveHologramCard";
import { useAuth, DEMO_IDENTIFIERS } from "../../context/AuthContext";

export default function StudentPortalPage() {
  const router = useRouter();
  const { user, isAuthenticated, loginStudent, logout } = useAuth();

  // Login form state
  const [loginPrn, setLoginPrn] = useState(DEMO_IDENTIFIERS.studentPrn);
  const [loginPass, setLoginPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    const res = await loginStudent(loginPrn, loginPass);
    setLoginLoading(false);
    if (!res.success) {
      setLoginError(res.error || "Login failed");
    } else {
      router.push("/student");
    }
  };

  // 1. SESSION CONFLICT: If already logged in as Admin, show Access Denied notice
  if (isAuthenticated && user?.role === "EXAM_ADMIN") {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-blue-200 shadow-xl p-8 sm:p-10 space-y-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mx-auto shadow-inner">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <span className="px-3 py-1 bg-blue-100 text-blue-900 border border-blue-200 rounded-full text-xs font-bold uppercase tracking-wider">
            Session Role Conflict
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
            Access Restricted to Students
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            You are currently signed in under the <strong>Examination Cell Authority</strong> account ({user.fullName || "Prof. V. M. Deshpande"}).
            The Student Vault is reserved for student credential holders.
          </p>
        </div>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/issuer"
            className="w-full sm:w-auto px-6 py-3 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            Go to University Admin Console
          </Link>
          <button
            onClick={logout}
            className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-300 rounded-xl text-xs font-bold transition-all"
          >
            Sign Out &amp; Switch to Student
          </button>
        </div>
      </div>
    );
  }

  // 2. UNAUTHENTICATED: Full-Page Split Screen View
  if (!isAuthenticated || !user || user.role !== "STUDENT") {
    return (
      <div className="w-full max-w-5xl mx-auto my-4 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 grid grid-cols-1 lg:grid-cols-12 min-h-[580px] bg-white">
        {/* LEFT SIDE: University Branding */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-950 via-blue-950 to-blue-900 text-white p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle decorative glow */}
          <div className="absolute -right-16 -top-16 w-56 h-56 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-56 h-56 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

          {/* Top: University Brand */}
          <div className="space-y-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-inner">
                <GraduationCap className="h-7 w-7 text-blue-300" />
              </div>
              <div>
                <span className="text-xs uppercase font-extrabold tracking-widest text-blue-300 block">
                  MGM University
                </span>
                <span className="text-[10px] text-blue-200/80 font-medium">
                  Chhatrapati Sambhajinagar, Maharashtra
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-xs rounded-full text-[11px] font-bold text-blue-200 border border-white/15">
              <Sparkles className="h-3 w-3 text-blue-300" />
              <span>Academic Portal &bull; Student SSO</span>
            </div>
          </div>

          {/* Center: Student Academic Portal */}
          <div className="space-y-4 my-8 relative z-10">
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-blue-300 uppercase tracking-widest block">
                Office of Academic Records
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Student Credential &amp; Degree Vault
              </h2>
            </div>
            <p className="text-xs text-blue-100/85 leading-relaxed">
              Official student self-sovereign portal. Sign in with your permanent registration credentials to access your verified degrees, cryptographic proofs, and digital credentials.
            </p>
          </div>

          {/* Bottom Footer Note */}
          <div className="pt-4 border-t border-white/10 text-[11px] text-blue-200/70 flex items-center justify-between relative z-10">
            <span>Powered by Ethereum Sepolia</span>
            <span className="font-mono font-bold text-white/90">EVM v0.8.20</span>
          </div>
        </div>

        {/* RIGHT SIDE: Clean Login Form */}
        <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                Student SSO Login
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Enter your Permanent Registration Number (PRN) and student password to unlock your vault.
              </p>
            </div>

            <form onSubmit={handleStudentLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Permanent Registration Number (PRN):
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={loginPrn}
                    onChange={(e) => setLoginPrn(e.target.value.toUpperCase())}
                    required
                    placeholder="PRN20200101"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3.5 py-3 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-hidden transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Student ERP Password / PIN:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-10 py-3 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all"
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
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between">
                <span className="text-[11px] text-blue-900 font-semibold">Demo Student PRN:</span>
                <button
                  type="button"
                  onClick={() => {
                    setLoginPrn(DEMO_IDENTIFIERS.studentPrn);
                  }}
                  className="text-xs text-blue-700 font-bold hover:underline flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3 text-blue-600" />
                  <span>Fill PRN ({DEMO_IDENTIFIERS.studentPrn})</span>
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
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50"
              >
                <UserCheck className="h-4 w-4" />
                <span>{loginLoading ? "Verifying Credentials..." : "Unlock Student Credential Vault"}</span>
              </button>
            </form>

            <div className="pt-2 text-center text-[11px] text-slate-400">
              MGM University Official SSO &bull; Strict DPDP Cryptographic Privacy
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <StudentVaultWorkspace prn={(user as any).prn} logout={logout} />;
}

import { GraduationCap } from "lucide-react";

function StudentVaultWorkspace({ prn, logout }: { prn: string; logout: () => void }) {
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isBinding, setIsBinding] = useState(false);
  const [bindingSuccess, setBindingSuccess] = useState<string | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [boundRecord, setBoundRecord] = useState<any>(null);

  // Vault credentials
  const [studentCredentials, setStudentCredentials] = useState<W3CCredentialPayload[]>([]);
  const [selectedCredForZk, setSelectedCredForZk] = useState<W3CCredentialPayload | null>(null);
  const [selectedCredForPreview, setSelectedCredForPreview] = useState<W3CCredentialPayload | null>(null);
  const [activeQrModal, setActiveQrModal] = useState<{ isOpen: boolean; qrDataUrl: string; prn: string }>({
    isOpen: false,
    qrDataUrl: "",
    prn: "",
  });
  const [copiedCredId, setCopiedCredId] = useState<string | null>(null);

  useEffect(() => {
    checkWalletAndIdentities();
    loadStudentVault();
  }, [prn]);

  const checkWalletAndIdentities = async () => {
    const identities = getStoredIdentities();
    const currentBinding = identities[prn.toUpperCase()];
    if (currentBinding) {
      setBoundRecord(currentBinding);
      setWalletAddress(currentBinding.walletAddress);
    } else {
      setBoundRecord(null);
    }

    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0 && !currentBinding) {
          setWalletAddress(accounts[0].address);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const loadStudentVault = () => {
    const batches = getStoredBatches();
    const creds: W3CCredentialPayload[] = [];
    const config = getSepoliaConfig();

    batches.forEach((batch) => {
      const records = batch.records || [];
      const student = records.find(
        (s) => s.prn.toUpperCase() === prn.toUpperCase()
      );
      if (student) {
        const { proofs } = buildBatchMerkleTree(records);
        const leafIndex = records.findIndex(
          (s) => s.prn.toUpperCase() === prn.toUpperCase()
        );
        const proofObj = {
          ...proofs[leafIndex],
          batchId: batch.batchId,
          contractAddress: config.credentialRegistryAddress,
        };
        const payload = createW3CCredential(
          student,
          proofObj,
          batch.issuer,
          batch.institutionName,
          batch.institutionCode
        );
        creds.push(payload);
      }
    });

    setStudentCredentials(creds);
    if (creds.length > 0 && !selectedCredForPreview) {
      setSelectedCredForPreview(creds[0]);
    }
  };

  const handleSignBinding = async () => {
    setIsBinding(true);
    setBindingError(null);
    setBindingSuccess(null);

    try {
      if (typeof window === "undefined" || !(window as any).ethereum) {
        throw new Error("MetaMask is required to sign the EIP-712 identity challenge.");
      }

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const currentAddress = await signer.getAddress();
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      const config = getSepoliaConfig();
      const { signature, timestamp } = await signIdentityBinding(
        signer,
        config.identityRegistryAddress,
        prn.toUpperCase(),
        chainId
      );

      const isValid = verifyIdentityBindingSignature(
        prn.toUpperCase(),
        currentAddress,
        timestamp,
        signature,
        config.identityRegistryAddress,
        chainId
      );

      if (!isValid) {
        throw new Error("Cryptographic EIP-712 signature verification failed.");
      }

      saveIdentityBinding({ prn: prn.toUpperCase(), walletAddress: currentAddress, signature, timestamp });
      setBoundRecord({ prn: prn.toUpperCase(), walletAddress: currentAddress, signature, timestamp });
      setWalletAddress(currentAddress);
      setBindingSuccess(`Successfully bound ${prn.toUpperCase()} to wallet ${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}`);
    } catch (err: any) {
      console.error("Binding error:", err);
      setBindingError(err.message || "Failed to sign identity challenge.");
    } finally {
      setIsBinding(false);
    }
  };

  const handleDownloadCredential = (cred: W3CCredentialPayload) => {
    const filename = `${cred.credentialSubject.prn}_degree_verifiable_credential.json`;
    downloadFile(JSON.stringify(cred, null, 2), filename, "application/json");
  };

  const handleCopyShareLink = (cred: W3CCredentialPayload) => {
    try {
      const jsonStr = JSON.stringify(cred);
      const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
      const url = `${window.location.origin}/?cred=${encodeURIComponent(b64)}&verifier=true`;
      navigator.clipboard.writeText(url);
      setCopiedCredId(cred.id);
      setTimeout(() => setCopiedCredId(null), 2500);
    } catch (e) {
      console.error("Failed to copy share link:", e);
    }
  };

  const handleShowQr = async (cred: W3CCredentialPayload) => {
    try {
      const qrPayload = JSON.stringify({
        id: cred.id,
        prn: cred.credentialSubject.prn,
        batchId: cred.proof.merkleProof?.batchId || "",
        merkleRoot: cred.proof.merkleProof?.rootHash || "",
        leafIndex: cred.proof.merkleProof?.leafIndex || 0,
        contractAddress: cred.proof.merkleProof?.contractAddress || "",
      });

      const dataUrl = await QRCode.toDataURL(qrPayload, {
        width: 340,
        margin: 2,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });

      setActiveQrModal({
        isOpen: true,
        qrDataUrl: dataUrl,
        prn: cred.credentialSubject.prn,
      });
    } catch (e) {
      console.error("QR Generation error:", e);
    }
  };

  return (
    <div className="space-y-8 py-4">
      {/* Student Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Student Credential Vault
              </h1>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-mono font-bold rounded-full">
                {prn}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              EIP-712 Decentralized Identity Binding &amp; W3C Verifiable Credentials
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
            <span>Active Student Session</span>
          </span>
        </div>
      </div>

      {/* Grid: EIP-712 Identity Binding + Active Hologram Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* EIP-712 Identity Binding Card */}
        <div className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <Fingerprint className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  EIP-712 Decentralized Identity Binding
                </h2>
                <p className="text-xs text-slate-500">
                  Bind your MetaMask wallet address cryptographically to your Permanent Registration Number (PRN).
                </p>
              </div>
            </div>

            {boundRecord ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Wallet Bound</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Unbound</span>
              </span>
            )}
          </div>

          {boundRecord ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Bound Permanent Reg No:</span>
                  <span className="font-mono font-bold text-slate-900">{boundRecord.prn}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Bound MetaMask Address:</span>
                  <span className="font-mono font-bold text-blue-600 truncate max-w-[200px] sm:max-w-[300px]">
                    {boundRecord.walletAddress}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Challenge Timestamp:</span>
                  <span className="font-mono text-slate-700">
                    {new Date(boundRecord.timestamp * 1000).toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={handleSignBinding}
                disabled={isBinding}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-300"
              >
                <KeyRound className="h-4 w-4 text-blue-600" />
                <span>{isBinding ? "Signing..." : "Re-bind / Update MetaMask Identity"}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                By signing the typed EIP-712 data challenge in MetaMask, you generate a mathematical proof that binds your wallet to your student ID without spending any gas.
              </p>

              <button
                onClick={handleSignBinding}
                disabled={isBinding}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                <span>{isBinding ? "Requesting Signature..." : "Sign EIP-712 Identity Challenge"}</span>
              </button>
            </div>
          )}

          {bindingSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{bindingSuccess}</span>
            </div>
          )}

          {bindingError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{bindingError}</span>
            </div>
          )}
        </div>

        {/* Interactive Hologram Card */}
        <div>
          {selectedCredForPreview ? (
            <InteractiveHologramCard>
              <div className="p-6 bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-950 text-white rounded-3xl border border-blue-500/30 shadow-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-blue-400" />
                    <span className="text-xs font-bold text-blue-200">Official Degree Pass</span>
                  </div>
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold rounded-full">
                    Sepolia Verified
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-black text-white">
                    {selectedCredForPreview.credentialSubject.fullName}
                  </h3>
                  <p className="text-xs text-blue-200">
                    {selectedCredForPreview.credentialSubject.degree}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {selectedCredForPreview.credentialSubject.branch} &bull; CGPA: {selectedCredForPreview.credentialSubject.cgpa}
                  </p>
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>PRN: {selectedCredForPreview.credentialSubject.prn}</span>
                  <span>Class of {selectedCredForPreview.credentialSubject.graduationYear}</span>
                </div>
              </div>
            </InteractiveHologramCard>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 text-center text-xs text-slate-500">
              No credential active in vault
            </div>
          )}
        </div>
      </div>

      {/* Available Credentials in Student Vault */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Award className="h-5 w-5 text-blue-600" />
          <span>My Verifiable Credentials ({studentCredentials.length})</span>
        </h2>

        {studentCredentials.length === 0 ? (
          <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-2">
            <GraduationCap className="h-10 w-10 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No Credentials Found for {prn}</p>
            <p className="text-xs text-slate-500">
              Ask your University Examination Cell to anchor your graduation batch on-chain.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {studentCredentials.map((cred) => (
              <div
                key={cred.id}
                className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {cred.credentialSubject.degree} ({cred.credentialSubject.branch})
                    </h3>
                    <p className="text-xs text-slate-500">
                      {cred.issuer.name} &bull; Batch: {cred.proof.merkleProof?.batchId || "BATCH01"} &bull; CGPA: {cred.credentialSubject.cgpa}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleCopyShareLink(cred)}
                      className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                      title="Copy 1-click verification link for job applications and LinkedIn"
                    >
                      {copiedCredId === cred.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                      <span>{copiedCredId === cred.id ? "Link Copied!" : "Share 1-Click Link"}</span>
                    </button>

                    <button
                      onClick={() => handleDownloadCredential(cred)}
                      className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      <Download className="h-3.5 w-3.5 text-blue-600" />
                      <span>Download JSON</span>
                    </button>

                    <button
                      onClick={() => handleShowQr(cred)}
                      className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      <QrCode className="h-3.5 w-3.5 text-slate-600" />
                      <span>View QR</span>
                    </button>

                    <button
                      onClick={() => setSelectedCredForZk(cred)}
                      className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                      <span>Selective Disclosure</span>
                    </button>
                  </div>
                </div>

                {/* Certificate Preview */}
                <DegreeCertificate credential={cred} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selective Disclosure Modal */}
      {selectedCredForZk && (
        <ZkProofModal
          isOpen={!!selectedCredForZk}
          onClose={() => setSelectedCredForZk(null)}
          credential={selectedCredForZk}
        />
      )}

      {/* QR Code Modal */}
      {activeQrModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-4 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              Student Credential QR
            </h3>
            <div className="p-3 bg-white border border-slate-200 rounded-2xl inline-block shadow-inner">
              <img
                src={activeQrModal.qrDataUrl}
                alt="Credential QR"
                className="w-64 h-64 mx-auto rounded-lg"
              />
            </div>
            <p className="text-xs text-slate-500 font-mono font-bold">
              PRN: {activeQrModal.prn}
            </p>
            <button
              onClick={() => setActiveQrModal({ isOpen: false, qrDataUrl: "", prn: "" })}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
