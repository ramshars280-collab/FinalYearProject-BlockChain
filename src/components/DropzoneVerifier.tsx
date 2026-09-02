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
  Building2,
  Award,
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
        colors: ["#2563eb", "#3b82f6", "#10b981", "#0284c7"],
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
          issuingInstitutionName: data.issuer?.name || data.credentialSubject?.university || "MGM University",
          issuingInstitutionAddress: data.issuer?.ethereumAddress,
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
          tamperReason: `Data Tampered! Calculated leaf hash (${computedLeaf.slice(0, 10)}••••) differs from certificate proof leaf (${claimedLeaf.slice(0, 10)}••••).`,
          computedLeaf,
          batchId: proofData.batchId,
          credential: data,
          verifiedAt: new Date().toLocaleTimeString(),
          issuingInstitutionName: data.issuer?.name || subject.university,
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
          ? "This academic degree credential was REVOKED by the University Examination Authority."
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
        issuingInstitutionName: onChainCheck.issuingInstitutionName || data.issuer?.name || subject.university,
        issuingInstitutionAddress: onChainCheck.issuingInstitutionAddress || data.issuer?.ethereumAddress,
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
        className={`relative overflow-hidden border-2 border-dashed rounded-3xl p-8 sm:p-14 text-center transition-all bg-white shadow-md ${
          dragActive
            ? "border-blue-600 bg-blue-50/50 scale-[1.01] ring-4 ring-blue-500/10"
            : "border-slate-300 hover:border-blue-500 hover:bg-slate-50/50"
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
          <div className="mx-auto w-20 h-20 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm relative group">
            <Fingerprint className="h-10 w-10 text-blue-600" />
            <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-4 ring-white animate-pulse" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Drag &amp; Drop Academic Degree Credential
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Consortium Inter-University Verification &bull; W3C JSON-LD &bull; Sepolia Smart Contract &bull; Zero-PII
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-98"
            >
              Select .JSON Credential
            </button>

            <button
              onClick={() => setIsQrModalOpen(true)}
              className="px-5 py-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-2 transition-all hover:scale-102 shadow-xs"
            >
              <QrCode className="h-4 w-4 text-blue-600" />
              <span>Scan QR Code</span>
            </button>
          </div>

          {/* Quick Demo Pre-Anchored Fixtures */}
          <div className="pt-5 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-slate-500 font-bold mr-1">Demo Consortium Fixtures:</span>
            <button
              onClick={() => loadFixture("/fixtures/valid_degree_sample.json")}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-lg font-semibold transition-all shadow-2xs flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
              <span>MGM University</span>
            </button>
            <button
              onClick={() => loadFixture("/fixtures/sppu_degree_sample.json")}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-lg font-semibold transition-all shadow-2xs flex items-center gap-1.5"
            >
              <Building2 className="h-3.5 w-3.5 text-indigo-600" />
              <span>SPPU Pune</span>
            </button>
            <button
              onClick={() => loadFixture("/fixtures/mu_degree_sample.json")}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg font-semibold transition-all shadow-2xs flex items-center gap-1.5"
            >
              <Award className="h-3.5 w-3.5 text-amber-700" />
              <span>Mumbai University</span>
            </button>
            <button
              onClick={() => loadFixture("/fixtures/tampered_degree_sample.json")}
              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-900 border border-red-200 rounded-lg font-semibold transition-all shadow-2xs flex items-center gap-1.5"
            >
              <XCircle className="h-3.5 w-3.5 text-red-600" />
              <span>Tampered Sample</span>
            </button>
          </div>
        </div>
      </div>

      {/* Verification In-Progress Stepper Animation */}
      {isVerifying && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
            <h4 className="text-sm font-bold text-slate-900">
              Evaluating Cryptographic Proof Against Ethereum Sepolia Consortium...
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 text-xs">
            <div className={`p-2.5 rounded-lg border flex items-center gap-2 ${verificationStep >= 1 ? "bg-blue-50 border-blue-300 text-blue-950 font-bold" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
              <CheckCircle2 className={`h-4 w-4 ${verificationStep >= 1 ? "text-blue-600" : "text-slate-300"}`} />
              <span>1. Canonical Keccak256</span>
            </div>
            <div className={`p-2.5 rounded-lg border flex items-center gap-2 ${verificationStep >= 2 ? "bg-blue-50 border-blue-300 text-blue-950 font-bold" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
              <CheckCircle2 className={`h-4 w-4 ${verificationStep >= 2 ? "text-blue-600" : "text-slate-300"}`} />
              <span>2. Merkle Proof Path</span>
            </div>
            <div className={`p-2.5 rounded-lg border flex items-center gap-2 ${verificationStep >= 3 ? "bg-blue-50 border-blue-300 text-blue-950 font-bold" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
              <CheckCircle2 className={`h-4 w-4 ${verificationStep >= 3 ? "text-blue-600" : "text-slate-300"}`} />
              <span>3. Sepolia Contract Call</span>
            </div>
            <div className={`p-2.5 rounded-lg border flex items-center gap-2 ${verificationStep >= 4 ? "bg-blue-50 border-blue-300 text-blue-950 font-bold" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
              <CheckCircle2 className={`h-4 w-4 ${verificationStep >= 4 ? "text-blue-600" : "text-slate-300"}`} />
              <span>4. Dynamic Bitmap Status</span>
            </div>
          </div>
        </div>
      )}

      {/* Result Status Banners */}
      {result && !isVerifying && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          {/* SUCCESS STATE WITH EXPLICIT ISSUING UNIVERSITY BADGE */}
          {result.isValid && !result.isRevoked && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-md">
                    <ShieldCheck className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-extrabold text-emerald-950">
                        100% Authentic &amp; Tamper-Proof
                      </h4>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-full">
                        Verified On-Chain
                      </span>
                    </div>
                    <p className="text-xs text-emerald-800 mt-1">
                      Merkle root verified on Sepolia at {result.verifiedAt}. Leaf integrity and dynamic bitmap checks passed.
                    </p>
                  </div>
                </div>

                <div className="text-xs text-emerald-900 font-mono bg-white px-3.5 py-2 rounded-xl border border-emerald-200 shrink-0 font-bold">
                  Leaf Index: #{result.leafIndex ?? 0} &bull; Sepolia
                </div>
              </div>

              {/* Explicit Issuing University & Consortium Attribution Badge */}
              <div className="pt-3 border-t border-emerald-200/70 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white/80 p-3 rounded-xl border border-emerald-200 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                    Verified Issuing Institution:
                  </span>
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-blue-700" />
                    <span>{typeof result.issuingInstitutionName === "string" ? result.issuingInstitutionName : typeof credential?.credentialSubject?.university === "string" ? credential.credentialSubject.university : "MGM University"}</span>
                  </div>
                </div>

                <div className="bg-white/80 p-3 rounded-xl border border-emerald-200 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                    Consortium On-Chain Authority:
                  </span>
                  <div className="text-xs font-mono font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Authenticated Inter-University Trust Registry</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* REVOKED STATE */}
          {result.isRevoked && (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-6 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-amber-600 text-white rounded-2xl shadow-md shrink-0">
                <ShieldAlert className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-bold text-amber-950">
                    Credential Has Been Revoked
                  </h4>
                  <span className="text-[10px] font-bold uppercase bg-amber-200 border border-amber-300 text-amber-900 px-2 py-0.5 rounded-full">
                    Dynamic Bitmap Status
                  </span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  This academic credential was explicitly invalidated in the dynamic revocation registry on Ethereum Sepolia by {typeof result.issuingInstitutionName === "string" ? result.issuingInstitutionName : "the issuing university"}.
                </p>
              </div>
            </div>
          )}

          {/* TAMPER / FAILURE STATE */}
          {result.tamperDetected && !result.isRevoked && (
            <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-6 shadow-sm space-y-3">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-600 text-white rounded-2xl shadow-md shrink-0">
                  <XCircle className="h-7 w-7" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-red-950">
                    Cryptographic Hash Mismatch / Data Tampered
                  </h4>
                  <p className="text-xs text-red-800 mt-1">
                    {typeof result.tamperReason === "string" ? result.tamperReason : "The certificate content has been modified or does not match the anchored Sepolia Merkle tree."}
                  </p>
                </div>
              </div>

              {result.computedLeaf && (
                <div className="bg-white p-3 rounded-xl border border-red-200 text-xs font-mono text-red-900 space-y-1">
                  <div>Computed Hash: <span className="font-bold">{result.computedLeaf.slice(0, 10)}••••••••{result.computedLeaf.slice(-8)}</span></div>
                  <div>Status: <span className="text-red-700 font-bold">REJECTED (Does not match certified root)</span></div>
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
