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
  Share2,
  Link2,
  Check,
  ExternalLink,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { W3CCredentialPayload, VerificationResult } from "../types";
import { hashCredentialSubject, buildBatchMerkleTree, createW3CCredential } from "../lib/crypto";
import { verifyCredentialOnChain } from "../lib/contracts";
import { verifyZkSelectiveProof } from "../lib/zkProof";
import { getRevocationDetail, getStoredBatches, getSepoliaConfig } from "../lib/storage";
import DegreeCertificate from "./DegreeCertificate";
import QrScannerModal from "./QrScannerModal";

export default function DropzoneVerifier() {
  const searchParams = useSearchParams();
  const [activeInputTab, setActiveInputTab] = useState<"url" | "upload">("url");
  const [inputUrl, setInputUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStep, setVerificationStep] = useState<number>(0);
  const [credential, setCredential] = useState<W3CCredentialPayload | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
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
      // 1. Check if Selective Disclosure credential
      if (
        data.proof?.type === "SelectiveDisclosureProof2024" ||
        data.proof?.type === "ZkSelectiveProof2024" ||
        data.proof?.selectiveProof ||
        data.proof?.zkProof
      ) {
        await new Promise((r) => setTimeout(r, 250));
        setVerificationStep(3);
        const selectiveValidation = verifyZkSelectiveProof(data);
        const res: VerificationResult = {
          isValid: selectiveValidation.isValid,
          isRevoked: false,
          tamperDetected: !selectiveValidation.isValid,
          tamperReason: selectiveValidation.isValid ? undefined : selectiveValidation.message,
          credential: data,
          verifiedAt: new Date().toLocaleTimeString(),
          isZkSelectiveProof: true,
          isSelectiveDisclosure: true,
          issuingInstitutionName: data.issuer?.name || data.credentialSubject?.university || "MGM University",
          issuingInstitutionAddress: data.issuer?.ethereumAddress,
        };
        setResult(res);
        if (selectiveValidation.isValid) triggerConfetti();
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
    setFileError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        handleCredentialVerification(parsed);
      } catch (err) {
        setFileError("Unable to extract cryptographic certificate data from this file. Please check file format.");
      }
    };
    reader.onerror = () => {
      setFileError("Failed to read the file from your device.");
    };
    reader.readAsText(file);
  };

  const handleVerifyPastedUrl = (rawInput?: string) => {
    setUrlError(null);
    const target = (rawInput !== undefined ? rawInput : inputUrl).trim();
    if (!target) {
      setUrlError("Please enter or paste a verification URL or Student PRN.");
      return;
    }

    try {
      // 1. If it's a URL, extract cred / data query parameter
      if (target.includes("http://") || target.includes("https://") || target.includes("?") || target.includes("cred=") || target.includes("data=")) {
        let credParam: string | null = null;
        try {
          const urlObj = target.startsWith("http") ? new URL(target) : new URL(target, window.location.origin);
          credParam = urlObj.searchParams.get("cred") || urlObj.searchParams.get("data");
        } catch {
          const match = target.match(/[?&](cred|data)=([^&#]+)/);
          if (match) credParam = match[2];
        }

        if (credParam) {
          let jsonStr = "";
          try {
            jsonStr = decodeURIComponent(escape(atob(credParam)));
          } catch {
            jsonStr = decodeURIComponent(credParam);
          }
          const parsed = JSON.parse(jsonStr);
          handleCredentialVerification(parsed);
          return;
        }
      }

      // 2. Direct PRN / Roll Number lookup (e.g. PRN20200101)
      const batches = getStoredBatches();
      for (const batch of batches) {
        const studentIndex = batch.records?.findIndex(
          (s: any) => s.prn?.toLowerCase() === target.toLowerCase()
        );
        if (studentIndex !== undefined && studentIndex !== -1 && batch.records?.[studentIndex]) {
          const student = batch.records[studentIndex];
          const treeData = buildBatchMerkleTree(batch.records);
          const proofData = {
            ...treeData.proofs[studentIndex],
            batchId: batch.batchId,
            contractAddress: getSepoliaConfig().credentialRegistryAddress,
            network: "Ethereum Sepolia",
          };
          const cred = createW3CCredential(
            student,
            proofData,
            batch.issuer,
            batch.institutionName,
            batch.institutionCode
          );
          handleCredentialVerification(cred);
          return;
        }
      }

      // 3. Raw JSON object string
      if (target.startsWith("{") && target.endsWith("}")) {
        const parsed = JSON.parse(target);
        handleCredentialVerification(parsed);
        return;
      }

      // 4. Base64 payload
      try {
        const jsonStr = decodeURIComponent(escape(atob(target)));
        const parsed = JSON.parse(jsonStr);
        handleCredentialVerification(parsed);
        return;
      } catch {}

      setUrlError("No active on-chain credential found matching this URL or PRN. Please verify the link.");
    } catch (e: any) {
      setUrlError("Invalid URL format or corrupted credential data.");
    }
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

  // Auto-verify credential passed via URL parameter (?cred=... or ?data=...)
  useEffect(() => {
    const credParam = searchParams.get("cred") || searchParams.get("data");
    if (credParam) {
      try {
        let jsonStr = "";
        try {
          jsonStr = decodeURIComponent(escape(atob(credParam)));
        } catch {
          jsonStr = decodeURIComponent(credParam);
        }
        const parsed = JSON.parse(jsonStr);
        handleCredentialVerification(parsed);
      } catch (err) {
        console.error("Failed to parse URL credential parameter", err);
      }
    }
  }, [searchParams]);

  const copyVerificationLink = () => {
    if (!credential) return;
    try {
      const jsonStr = JSON.stringify(credential);
      const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
      const url = `${window.location.origin}/?cred=${encodeURIComponent(b64)}&verifier=true`;
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (e) {
      console.error("Failed to generate share link", e);
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
      {/* If not currently displaying a verified result, show the Dual-Method Input Hub */}
      {!result && (
        <div className="space-y-4">
          {/* Method Switcher Tabs: URL vs Upload File */}
          <div className="flex items-center justify-center gap-2 max-w-sm mx-auto p-1.5 bg-slate-200/70 rounded-2xl border border-slate-300 shadow-inner">
            <button
              onClick={() => {
                setActiveInputTab("url");
                setUrlError(null);
                setFileError(null);
              }}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeInputTab === "url"
                  ? "bg-white text-blue-950 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Link2 className="h-4 w-4 text-blue-600" />
              <span>Verify via URL</span>
            </button>

            <button
              onClick={() => {
                setActiveInputTab("upload");
                setUrlError(null);
                setFileError(null);
              }}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeInputTab === "upload"
                  ? "bg-white text-blue-950 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UploadCloud className="h-4 w-4 text-blue-600" />
              <span>Upload File</span>
            </button>
          </div>

          {/* TAB 1: VERIFY VIA URL */}
          {activeInputTab === "url" && (
            <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 shadow-md space-y-6 text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs relative">
                <Link2 className="h-8 w-8 text-blue-600" />
                <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-4 ring-white animate-pulse" />
              </div>

              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Verify via Credential URL
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Paste the verification link from the student&apos;s resume, LinkedIn, or email.
                </p>
              </div>

              <div className="max-w-xl mx-auto space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={inputUrl}
                      onChange={(e) => {
                        setInputUrl(e.target.value);
                        if (urlError) setUrlError(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleVerifyPastedUrl()}
                      placeholder="Paste verification URL or Student PRN (e.g. PRN20200101)..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-xs text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-600 pr-10"
                    />
                    {inputUrl && (
                      <button
                        onClick={() => setInputUrl("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => handleVerifyPastedUrl()}
                    disabled={isVerifying}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 shrink-0 hover:scale-102"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>{isVerifying ? "Verifying..." : "Verify URL"}</span>
                  </button>
                </div>

                {urlError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-2 justify-center font-semibold">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                    <span>{urlError}</span>
                  </div>
                )}

                {/* Quick Try Sample Links / PRNs */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">Quick Try Samples:</span>
                  <button
                    onClick={() => {
                      setInputUrl("PRN20200101");
                      handleVerifyPastedUrl("PRN20200101");
                    }}
                    className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-lg text-xs font-semibold transition-all"
                  >
                    PRN20200101 (Aarav Sharma)
                  </button>
                  <button
                    onClick={() => {
                      setInputUrl("PRN20200102");
                      handleVerifyPastedUrl("PRN20200102");
                    }}
                    className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold transition-all"
                  >
                    PRN20200102 (Ananya Deshmukh)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD CERTIFICATE FILE */}
          {activeInputTab === "upload" && (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`relative overflow-hidden border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all bg-white shadow-md ${
                dragActive
                  ? "border-blue-600 bg-blue-50/50 scale-[1.01] ring-4 ring-blue-500/10"
                  : "border-slate-300 hover:border-blue-500 hover:bg-slate-50/50"
              }`}
            >
              {isVerifying && <div className="laser-scan-line" />}

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.txt,application/json"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                className="hidden"
              />

              <div className="max-w-md mx-auto space-y-4">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs relative group">
                  <UploadCloud className="h-8 w-8 text-blue-600" />
                  <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-4 ring-white animate-pulse" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    Upload Certificate File
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    Drag and drop your academic degree certificate file or browse from your device
                  </p>
                </div>

                {fileError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-2 justify-center font-semibold">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                    <span>{fileError}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-98"
                  >
                    Select Certificate File
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
                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="text-slate-500 font-bold mr-1">Demo File Samples:</span>
                  <button
                    onClick={() => loadFixture("/fixtures/valid_degree_sample.json")}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-lg font-semibold transition-all shadow-2xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                    <span>MGM University (Valid)</span>
                  </button>
                  <button
                    onClick={() => loadFixture("/fixtures/tampered_degree_sample.json")}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-900 border border-red-200 rounded-lg font-semibold transition-all shadow-2xs flex items-center gap-1.5"
                  >
                    <XCircle className="h-3.5 w-3.5 text-red-600" />
                    <span>Tampered Sample (Invalid)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
          <div className="flex items-center justify-between pb-1">
            <button
              onClick={() => {
                setResult(null);
                setCredential(null);
                setInputUrl("");
                setUrlError(null);
                setFileError(null);
              }}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 transition-colors px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 shadow-2xs"
            >
              <span>← Verify Another Credential (URL or File)</span>
            </button>
          </div>

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

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={copyVerificationLink}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold transition-all shadow-xs"
                    title="Copy direct verification link for resumes/LinkedIn"
                  >
                    {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Share2 className="h-3.5 w-3.5 text-emerald-700" />}
                    <span>{copiedLink ? "Link Copied!" : "Share 1-Click Link"}</span>
                  </button>
                  <div className="text-xs text-emerald-900 font-mono bg-white px-3.5 py-2 rounded-xl border border-emerald-200 shrink-0 font-bold">
                    Leaf Index: #{result.leafIndex ?? 0} &bull; Sepolia
                  </div>
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
            <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-start gap-4">
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

              {/* Enhanced Revocation Taxonomy & Replacement Detail */}
              {(() => {
                const rev = getRevocationDetail(result.batchId, result.leafIndex);
                if (!rev) return null;
                return (
                  <div className="bg-white/90 p-4 rounded-xl border border-amber-300 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-950 flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-amber-700" />
                        <span>Official Reason: {rev.reasonTitle || rev.reasonCode}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        Revoked: {rev.revokedAt}
                      </span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">
                      {rev.reasonDescription}
                    </p>
                    {rev.supersededByHash && (
                      <div className="pt-2 border-t border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                        <span className="text-amber-900 font-bold">Superseded by Replacement Credential:</span>
                        <span className="font-mono font-bold text-blue-800 break-all">{rev.supersededByHash}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
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
