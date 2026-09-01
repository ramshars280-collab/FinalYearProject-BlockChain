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
  const [credential, setCredential] = useState<W3CCredentialPayload | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#10b981", "#1e3a8a", "#f59e0b", "#6366f1"],
      });
    } catch (e) {
      // ignore
    }
  };

  const handleCredentialVerification = async (data: W3CCredentialPayload) => {
    setIsVerifying(true);
    setCredential(data);
    setResult(null);

    try {
      // 1. Check if ZK Selective Disclosure credential
      if (data.proof?.type === "ZkSelectiveProof2024" || data.proof?.zkProof) {
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

      if (computedLeaf.toLowerCase() !== claimedLeaf.toLowerCase()) {
        setResult({
          isValid: false,
          isRevoked: false,
          tamperDetected: true,
          tamperReason: `Data Tampered! Calculated leaf hash (${computedLeaf.slice(0, 10)}...) does not match certificate proof leaf (${claimedLeaf.slice(0, 10)}...).`,
          computedLeaf,
          batchId: proofData.batchId,
          credential: data,
          verifiedAt: new Date().toLocaleTimeString(),
        });
        setIsVerifying(false);
        return;
      }

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
        className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all bg-white shadow-xs ${
          dragActive
            ? "border-blue-600 bg-blue-50/50 scale-[1.01]"
            : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          className="hidden"
        />

        <div className="max-w-md mx-auto space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-900 shadow-inner">
            <UploadCloud className="h-8 w-8" />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900">
              Drag and drop your academic degree certificate
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Accepts W3C Verifiable Credentials (.json) &bull; Zero-gas cryptographic verification
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all hover:shadow"
            >
              Select .JSON File
            </button>

            <button
              onClick={() => setIsQrModalOpen(true)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <QrCode className="h-4 w-4 text-slate-600" />
              <span>Scan QR Code</span>
            </button>
          </div>

          {/* Instant Sample Fixture Buttons */}
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="text-slate-400 font-medium mr-1">Quick Demo:</span>
            <button
              onClick={() => loadFixture("/fixtures/valid_degree_sample.json")}
              className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-medium transition-colors"
            >
              &check; Valid Degree Sample
            </button>
            <button
              onClick={() => loadFixture("/fixtures/tampered_degree_sample.json")}
              className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 rounded-lg font-medium transition-colors"
            >
              &times; Tampered Degree Sample
            </button>
          </div>
        </div>
      </div>

      {/* Verification In Progress State */}
      {isVerifying && (
        <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center shadow-xs flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="h-7 w-7 text-blue-700 animate-spin" />
          <div className="space-y-0.5">
            <p className="text-sm font-bold text-slate-900">
              Evaluating Cryptographic Proof Path...
            </p>
            <p className="text-xs text-slate-500">
              Recomputing Keccak256 hash &amp; verifying Sepolia Merkle Anchor
            </p>
          </div>
        </div>
      )}

      {/* Verification Status Result Banners */}
      {result && !isVerifying && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          {/* SUCCESS STATE */}
          {result.isValid && !result.isRevoked && (
            <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-400 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-md animate-pulse">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-bold text-emerald-950">
                      100% Authentic &amp; Tamper-Proof
                    </h4>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full">
                      Verified On-Chain
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Merkle root verified on Ethereum Sepolia. Leaf integrity cryptographic check passed at {result.verifiedAt}.
                  </p>
                </div>
              </div>

              <div className="text-xs text-emerald-900 font-mono bg-emerald-100/70 px-3 py-1.5 rounded-lg border border-emerald-300 shrink-0">
                Leaf Index: #{result.leafIndex ?? 0}
              </div>
            </div>
          )}

          {/* REVOKED STATE */}
          {result.isRevoked && (
            <div className="bg-amber-50 border-2 border-amber-500 rounded-2xl p-5 shadow-sm flex items-start gap-3">
              <div className="p-2.5 bg-amber-600 text-white rounded-xl shadow-md shrink-0">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-amber-950">
                    Credential Has Been Revoked
                  </h4>
                  <span className="text-[10px] font-bold uppercase bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                    Dynamic Bitmap Status
                  </span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  This academic credential was explicitly invalidated in the dynamic revocation registry on Ethereum Sepolia by the university examination authority.
                </p>
              </div>
            </div>
          )}

          {/* TAMPER / FAILURE STATE */}
          {result.tamperDetected && !result.isRevoked && (
            <div className="bg-red-50 border-2 border-red-500 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-red-600 text-white rounded-xl shadow-md shrink-0">
                  <XCircle className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-red-950">
                    Cryptographic Hash Mismatch / Data Tampered
                  </h4>
                  <p className="text-xs text-red-800 mt-0.5">
                    {result.tamperReason || "The certificate content has been modified or does not match the anchored Sepolia Merkle tree."}
                  </p>
                </div>
              </div>

              {result.computedLeaf && (
                <div className="bg-white/80 p-3 rounded-xl border border-red-200 text-xs font-mono text-red-900 space-y-1">
                  <div>Computed Hash (Current Data): <span className="font-bold">{result.computedLeaf}</span></div>
                  <div>Status: <span className="font-semibold text-red-700">REJECTED (Hash differs from certified root)</span></div>
                </div>
              )}
            </div>
          )}

          {/* Render Full Certificate if Credential Exists */}
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
