"use client";

import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
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
  Lock,
  Cpu,
  Fingerprint,
  Layers,
  LogOut,
  User,
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
import { useAuth, DEMO_CREDENTIALS } from "../../context/AuthContext";

export default function StudentPortalPage() {
  const { user, isAuthenticated, loginStudent, logout } = useAuth();

  // Login form state
  const [loginPrn, setLoginPrn] = useState(DEMO_CREDENTIALS.student.prn);
  const [loginPass, setLoginPass] = useState(DEMO_CREDENTIALS.student.password);
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
    }
  };

  // If not logged in as student, show clean centered login card
  if (!isAuthenticated || !user || user.role !== "STUDENT") {
    return (
      <div className="max-w-md mx-auto py-12 px-4 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-blue-50 border border-blue-200 text-blue-900 rounded-full text-xs font-bold">
            <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
            <span>Student SSO &bull; Academic Vault</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Student Vault Login
          </h1>
          <p className="text-xs text-slate-500">
            Sign in with your Permanent Registration Number (PRN) to access encrypted credentials and bind your MetaMask wallet.
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-5">
          <form onSubmit={handleStudentLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Permanent Registration No. (PRN):
              </label>
              <input
                type="text"
                value={loginPrn}
                onChange={(e) => setLoginPrn(e.target.value.toUpperCase())}
                required
                placeholder="PRN20200101"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Student ERP Password:
              </label>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setLoginPrn(DEMO_CREDENTIALS.student.prn);
                  setLoginPass(DEMO_CREDENTIALS.student.password);
                }}
                className="text-xs text-blue-700 font-bold hover:underline flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-Fill Demo Student (Aarav Sharma)</span>
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
              <span>{loginLoading ? "Authenticating..." : "Unlock Student Vault"}</span>
            </button>
          </form>
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

        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-xl text-xs font-bold transition-all shrink-0"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
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
                      <span>Generate ZK Proof</span>
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

      {/* ZK Selective Disclosure Modal */}
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
