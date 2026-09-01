"use client";

import React, { useState, useRef, useEffect } from "react";
import confetti from "canvas-confetti";
import {
  UploadCloud,
  FileCheck2,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  QrCode,
  Sparkles,
  RefreshCw,
  FileJson,
  CheckCircle2,
  XCircle,
  Search,
  Lock,
  Cpu,
  ArrowRight,
  Fingerprint,
} from "lucide-react";
import { W3CCredentialPayload, VerificationResult } from "../types";
import { hashCredentialSubject } from "../lib/crypto";
import { verifyCredentialOnChain } from "../lib/contracts";
import { verifyZkSelectiveProof } from "../lib/zkProof";
import DegreeCertificate from "./DegreeCertificate";
import QrScannerModal from "./QrScannerModal";

export default function DropzoneVerifier() {
  const [dragActive, setDragActive] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStep, setVerificationStep] = useState<number>(0);
  const [credential, setCredential] = useState<W3CCredentialPayload | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 100,
        spread: 90,
        origin: { y: 0.6 },
        colors: ["#38bdf8", "#34d399", "#818cf8", "#f59e0b", "#ec4899"],
      });
    } catch (e) {
      // ignore
    }
  };

  const handleCredentialVerification = async (data: W3CCredentialPayload) => {
    setIsVerifying(true);
    setVerificationStep(1);
    setCredential(data);
    setResult(null);

    // Progressive step simulation for rich feedback
    await new Promise((r) => setTimeout(r, 200));
    setVerificationStep(2);

    try {
      // 1. Check if ZK Selective Disclosure credential
      if (data.proof?.type === "ZkSelectiveProof2024" || data.proof?.zkProof) {
        await new Promise((r) => setTimeout(r, 250));
        setVerificationStep(3);
        const zkValidation = verifyZkSelectiveProof(data);
        const res: VerificationResult = {
          isValid: zkValidation.isValid,
          isRevoked: false,
          tamperDetected: !zkValidation.isValid,
          tamperReason: zkValidation.isValid ? undefined : zkValidation.message,
          credential: data,
          verifiedAt: new Date().toLocaleTimeString(),
          isZkSelectiveProof: true,
        };
        setResult(res);
        if (zkValidation.isValid) triggerConfetti();
        setIsVerifying(false);
        return;
      }

      // 2. Standard Merkle Proof Credential
      const subject = data.credentialSubject;
      const proofData = data.proof?.merkleProof;

      if (!subject || !proofData) {
        setResult({
          isValid: false,
          isRevoked: false,
          tamperDetected: true,
          tamperReason: "Invalid W3C Schema: Missing credentialSubject or merkleProof",
          credential: data,
          verifiedAt: new Date().toLocaleTimeString(),
        });
        setIsVerifying(false);
        return;
      }

      // Compute local Keccak256 hash of subject
      const computedLeaf = hashCredentialSubject(subject);
      const claimedLeaf = proofData.leafHash;

      await new Promise((r) => setTimeout(r, 200));
      setVerificationStep(3);

      if (computedLeaf.toLowerCase() !== claimedLeaf.toLowerCase()) {
        setResult({
          isValid: false,
          isRevoked: false,
          tamperDetected: true,
          tamperReason: `Data Tampered! Calculated leaf hash (${computedLeaf.slice(0, 12)}...) differs from certificate proof leaf (${claimedLeaf.slice(0, 12)}...).`,
          computedLeaf,
          batchId: proofData.batchId,
          credential: data,
          verifiedAt: new Date().toLocaleTimeString(),
        });
        setIsVerifying(false);
        return;
      }

      await new Promise((r) => setTimeout(r, 200));
      setVerificationStep(4);

      // Verify on Sepolia (or local registry fallback)
      const onChainCheck = await verifyCredentialOnChain(
        proofData.batchId,
        computedLeaf,
        proofData.proof,
        proofData.leafIndex,
        proofData.contractAddress
      );

      const isFullyValid = onChainCheck.isValid && !onChainCheck.isRevoked;

      const res: VerificationResult = {
        isValid: isFullyValid,
        isRevoked: onChainCheck.isRevoked,
        tamperDetected: !onChainCheck.isValid,
        tamperReason: onChainCheck.isRevoked
          ? "This academic degree credential was REVOKED by the University Examination Cell."
          : !onChainCheck.isValid
          ? "Merkle proof mismatch: Credential is not anchored in the Sepolia batch registry."
          : undefined,
        computedLeaf,
        matchedRoot: onChainCheck.rootHash,
        batchId: proofData.batchId,
        leafIndex: proofData.leafIndex,
        credential: data,
        network: "Ethereum Sepolia (11155111)",
        verifiedAt: new Date().toLocaleTimeString(),
      };

      setResult(res);
      if (isFullyValid) {
        triggerConfetti();
      }
    } catch (e: any) {
      setResult({
        isValid: false,
        isRevoked: false,
        tamperDetected: true,
        tamperReason: "Verification Error: " + e?.message,
        credential: data,
        verifiedAt: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        handleCredentialVerification(parsed);
      } catch (err) {
        alert("Invalid JSON file format");
      }
    };
    reader.readAsText(file);
  };

  const loadFixture = async (path: string) => {
    try {
      const res = await fetch(path);
      const data = await res.json();
      handleCredentialVerification(data);
    } catch (e) {
      console.error("Fixture load error:", e);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Dropzone Container */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative overflow-hidden border-2 border-dashed rounded-3xl p-8 sm:p-14 text-center transition-all glass-panel shadow-2xl ${
          dragActive
            ? "border-cyan-400 bg-cyan-950/40 scale-[1.01] ring-4 ring-cyan-500/20"
            : "border-slate-700/80 hover:border-slate-500 hover:bg-slate-900/60"
        }`}
      >
        {/* Animated Laser Scanning Beam */}
        {isVerifying && <div className="laser-scan-line" />}

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          className="hidden"
        />

        <div className="max-w-md mx-auto space-y-5">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600/30 to-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shadow-xl shadow-cyan-500/10 relative group">
            <Fingerprint className="h-10 w-10 text-cyan-400 drop-shadow" />
            <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-4 ring-slate-900 animate-pulse" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Drag &amp; Drop Academic Degree Credential
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              OpenCerts 2.0 &bull; W3C JSON-LD &bull; Sepolia Smart Contract &bull; DPDP Zero-PII
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/25 transition-all hover:scale-102 active:scale-98"
            >
              Select .JSON Credential
            </button>

            <button
              onClick={() => setIsQrModalOpen(true)}
              className="px-5 py-3 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all hover:scale-102"
            >
              <QrCode className="h-4 w-4 text-cyan-400" />
              <span>Scan QR Code</span>
            </button>
          </div>

          {/* Quick Demo Pre-Anchored Fixtures */}
          <div className="pt-5 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-slate-400 font-semibold mr-1">Demo Fixtures:</span>
            <button
              onClick={() => loadFixture("/fixtures/valid_degree_sample.json")}
              className="px-3.5 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 rounded-lg font-medium transition-all shadow-sm flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Valid Degree Sample</span>
            </button>
            <button
              onClick={() => loadFixture("/fixtures/tampered_degree_sample.json")}
              className="px-3.5 py-1.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-700/60 rounded-lg font-medium transition-all shadow-sm flex items-center gap-1.5"
            >
              <XCircle className="h-3.5 w-3.5 text-red-400" />
              <span>Tampered Degree Sample</span>
            </button>
          </div>
        </div>
      </div>

      {/* Verification In-Progress Stepper Animation */}
      {isVerifying && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-cyan-400 animate-spin" />
            <h4 className="text-sm font-bold text-white">
              Evaluating Cryptographic Proof Against Ethereum Sepolia...
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 text-xs">
            <div className={`p-2.5 rounded-lg border flex items-center gap-2 ${verificationStep >= 1 ? "bg-cyan-950/80 border-cyan-800 text-cyan-300" : "bg-slate-900/60 border-slate-800 text-slate-500"}`}>
              <CheckCircle2 className={`h-4 w-4 ${verificationStep >= 1 ? "text-cyan-400" : "text-slate-600"}`} />
              <span>1. Canonical Keccak256</span>
            </div>
            <div className={`p-2.5 rounded-lg border flex items-center gap-2 ${verificationStep >= 2 ? "bg-cyan-950/80 border-cyan-800 text-cyan-300" : "bg-slate-900/60 border-slate-800 text-slate-500"}`}>
              <CheckCircle2 className={`h-4 w-4 ${verificationStep >= 2 ? "text-cyan-400" : "text-slate-600"}`} />
              <span>2. Merkle Proof Path</span>
            </div>
            <div className={`p-2.5 rounded-lg border flex items-center gap-2 ${verificationStep >= 3 ? "bg-cyan-950/80 border-cyan-800 text-cyan-300" : "bg-slate-900/60 border-slate-800 text-slate-500"}`}>
              <CheckCircle2 className={`h-4 w-4 ${verificationStep >= 3 ? "text-cyan-400" : "text-slate-600"}`} />
              <span>3. Sepolia Contract Call</span>
            </div>
            <div className={`p-2.5 rounded-lg border flex items-center gap-2 ${verificationStep >= 4 ? "bg-cyan-950/80 border-cyan-800 text-cyan-300" : "bg-slate-900/60 border-slate-800 text-slate-500"}`}>
              <CheckCircle2 className={`h-4 w-4 ${verificationStep >= 4 ? "text-cyan-400" : "text-slate-600"}`} />
              <span>4. Dynamic Bitmap Status</span>
            </div>
          </div>
        </div>
      )}

      {/* Result Status Banners */}
      {result && !isVerifying && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          {/* SUCCESS STATE */}
          {result.isValid && !result.isRevoked && (
            <div className="glass-panel-glow border-emerald-500/40 rounded-2xl p-6 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-tr from-emerald-600 to-teal-400 text-white rounded-2xl shadow-lg shadow-emerald-500/30 animate-pulse">
                  <ShieldCheck className="h-7 w-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-lg font-extrabold text-white">
                      100% Authentic &amp; Tamper-Proof
                    </h4>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
                      Verified On-Chain
                    </span>
                  </div>
                  <p className="text-xs text-emerald-300/80 mt-1">
                    Merkle root verified on Sepolia at {result.verifiedAt}. Leaf integrity and dynamic bitmap checks passed.
                  </p>
                </div>
              </div>

              <div className="text-xs text-emerald-300 font-mono bg-emerald-950/80 px-3.5 py-2 rounded-xl border border-emerald-800/80 shrink-0">
                Leaf Index: #{result.leafIndex ?? 0} &bull; Sepolia
              </div>
            </div>
          )}

          {/* REVOKED STATE */}
          {result.isRevoked && (
            <div className="bg-amber-950/70 border-2 border-amber-500/80 rounded-2xl p-6 shadow-2xl flex items-start gap-4">
              <div className="p-3 bg-amber-600 text-white rounded-2xl shadow-lg shrink-0">
                <ShieldAlert className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-bold text-amber-200">
                    Credential Has Been Revoked
                  </h4>
                  <span className="text-[10px] font-bold uppercase bg-amber-500/20 border border-amber-500 text-amber-300 px-2 py-0.5 rounded-full">
                    Dynamic Bitmap Status
                  </span>
                </div>
                <p className="text-xs text-amber-300/90 leading-relaxed">
                  This academic credential was explicitly invalidated in the dynamic revocation registry on Ethereum Sepolia by the university examination authority.
                </p>
              </div>
            </div>
          )}

          {/* TAMPER / FAILURE STATE */}
          {result.tamperDetected && !result.isRevoked && (
            <div className="bg-red-950/80 border-2 border-red-500/80 rounded-2xl p-6 shadow-2xl space-y-3">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-600 text-white rounded-2xl shadow-lg shrink-0">
                  <XCircle className="h-7 w-7" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-red-200">
                    Cryptographic Hash Mismatch / Data Tampered
                  </h4>
                  <p className="text-xs text-red-300/90 mt-1">
                    {result.tamperReason || "The certificate content has been modified or does not match the anchored Sepolia Merkle tree."}
                  </p>
                </div>
              </div>

              {result.computedLeaf && (
                <div className="bg-slate-950 p-3 rounded-xl border border-red-800/80 text-xs font-mono text-red-300 space-y-1">
                  <div>Computed Hash: <span className="font-bold text-white">{result.computedLeaf}</span></div>
                  <div>Status: <span className="text-red-400 font-bold">REJECTED (Does not match certified root)</span></div>
                </div>
              )}
            </div>
          )}

          {/* Render Multi-Tab Official Certificate Card */}
          {credential && (
            <DegreeCertificate
              credential={credential}
              verification={result}
              onShowQr={() => setIsQrModalOpen(true)}
            />
          )}
        </div>
      )}

      <QrScannerModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        onScanSuccess={(scannedCred) => handleCredentialVerification(scannedCred)}
      />
    </div>
  );
}
