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
  FileText,
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
        const selectiveValidation = await verifyZkSelectiveProof(data);
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

  const handleFileUpload = async (file: File) => {
    setFileError(null);
    const fileName = file.name.toLowerCase();

    // 1. PDF Degree Certificate Verification
    if (fileName.endsWith(".pdf") || file.type === "application/pdf") {
      setIsVerifying(true);
      setVerificationStep(1);
      setResult(null);
      setCredential(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        await new Promise((r) => setTimeout(r, 200));
        setVerificationStep(2);

        const res = await fetch("/api/verify/pdf", {
          method: "POST",
          body: formData,
        });

        await new Promise((r) => setTimeout(r, 250));
        setVerificationStep(3);

        const data = await res.json();
        setIsVerifying(false);

        if (!res.ok || !data.success) {
          setFileError(
            data.error ||
              "Invalid certificate format: The uploaded PDF is not a recognized university degree certificate."
          );
          return;
        }

        if (data.credential) {
          setCredential(data.credential);
        }

        const isFullyValid = data.isValid !== false && !data.isRevoked && !data.tamperDetected;

        const verificationResult: VerificationResult = {
          isValid: isFullyValid,
          isRevoked: Boolean(data.isRevoked),
          tamperDetected: Boolean(data.tamperDetected),
          tamperReason: data.tamperReason,
          computedLeaf: data.credential?.proof?.merkleProof?.leafHash,
          matchedRoot: data.credential?.proof?.merkleProof?.rootHash,
          batchId: data.pdfExtracted?.batchId,
          leafIndex: data.pdfExtracted?.leafIndex,
          credential: data.credential,
          network: "Ethereum Sepolia (11155111)",
          verifiedAt: new Date().toLocaleTimeString(),
          issuingInstitutionName:
            data.credential?.issuer?.name || "MGM University, Chhatrapati Sambhajinagar",
          issuingInstitutionAddress: data.credential?.issuer?.ethereumAddress,
        };

        setResult(verificationResult);
        if (isFullyValid) {
          triggerConfetti();
        }
      } catch (err: any) {
        setIsVerifying(false);
        setFileError("Error communicating with verification service: " + (err?.message || "Unknown error"));
      }
      return;
    }

    // 2. JSON W3C Verifiable Credential Payload
    if (fileName.endsWith(".json") || file.type === "application/json") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const parsed = JSON.parse(text);
          if (!parsed || (!parsed.credentialSubject && !parsed.type)) {
            setFileError("Invalid format: The JSON file does not contain a valid W3C Verifiable Credential.");
            return;
          }
          handleCredentialVerification(parsed);
        } catch {
          setFileError("Invalid JSON syntax: Unable to parse cryptographic credential file.");
        }
      };
      reader.onerror = () => {
        setFileError("Failed to read the file from your device.");
      };
      reader.readAsText(file);
      return;
    }

    // 3. Unsupported format
    setFileError("Unsupported file format. Please upload an official degree certificate PDF (.pdf) or W3C Credential (.json).");
  };

  const handleVerifyPastedUrl = async (rawInput?: string) => {
    setUrlError(null);
    const target = (rawInput !== undefined ? rawInput : inputUrl).trim();
    if (!target) {
      setUrlError("Please enter or paste a verification URL or Student PRN.");
      return;
    }

    // 1. Is it an HTTP/HTTPS URL?
    const isUrl = /^https?:\/\//i.test(target) || /^\/\//.test(target);

    // 2. Is it a Student PRN? (e.g. PRN20200101, PRN20240051)
    const isPrn = /^PRN[A-Za-z0-9_-]+$/i.test(target);

    // If neither a valid URL nor a Student PRN:
    if (!isUrl && !isPrn) {
      setUrlError(
        "Invalid format. Verification requires a valid verification URL (e.g. https://.../?verify=...) or a valid Student PRN (e.g. PRN20200101)."
      );
      return;
    }

    try {
      if (isUrl) {
        let urlObj: URL;
        try {
          urlObj = new URL(target, typeof window !== "undefined" ? window.location.origin : undefined);
        } catch {
          setUrlError("Invalid URL format. Please provide a well-formed HTTP/HTTPS URL.");
          return;
        }

        // Check for ?verify=batchId/leafIndex or ?v=batchId/leafIndex
        const v = urlObj.searchParams.get("verify") || urlObj.searchParams.get("v");
        let shortBatchId: string | null = null;
        let shortLeafIndex: number | null = null;

        if (v) {
          const parts = v.replace(/^\/?api\/verify\//, "").split("/");
          if (parts.length >= 2) {
            shortBatchId = parts[0];
            shortLeafIndex = parseInt(parts[1], 10);
          }
        }

        // Check path /api/verify/batchId/leafIndex
        if (!shortBatchId && urlObj.pathname.includes("/api/verify/")) {
          const match = urlObj.pathname.match(/\/api\/verify\/([^/?#]+)\/(\d+)/);
          if (match) {
            shortBatchId = match[1];
            shortLeafIndex = parseInt(match[2], 10);
          }
        }

        if (shortBatchId && shortLeafIndex !== null && !isNaN(shortLeafIndex)) {
          setIsVerifying(true);
          const verified = await verifyByBatchAndLeaf(shortBatchId, shortLeafIndex);
          setIsVerifying(false);
          if (verified) return;
          setUrlError(`No on-chain credential found for batch "${shortBatchId}" at leaf index #${shortLeafIndex}.`);
          return;
        }

        // Check for ?cred=... or ?data=...
        const credParam = urlObj.searchParams.get("cred") || urlObj.searchParams.get("data");
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

        // URL does not contain verification parameters
        setUrlError(
          "Invalid verification URL: The URL does not contain academic degree verification parameters (expected '?verify=...' or '?cred=...')."
        );
        return;
      }

      if (isPrn) {
        setIsVerifying(true);
        // Direct PRN lookup: Query server batches first, then fallback to stored batches
        let student: any = null;
        let foundBatch: any = null;
        let leafIdx = -1;

        try {
          const res = await fetch("/api/batches");
          if (res.ok) {
            const data = await res.json();
            if (data.batches && Array.isArray(data.batches)) {
              for (const batch of data.batches) {
                const idx = batch.records?.findIndex(
                  (s: any) => s.prn?.trim().toLowerCase() === target.toLowerCase()
                );
                if (idx !== undefined && idx !== -1) {
                  student = batch.records[idx];
                  foundBatch = batch;
                  leafIdx = idx;
                  break;
                }
              }
            }
          }
        } catch {}

        if (!student) {
          const localBatches = getStoredBatches();
          for (const batch of localBatches) {
            const idx = batch.records?.findIndex(
              (s: any) => s.prn?.trim().toLowerCase() === target.toLowerCase()
            );
            if (idx !== undefined && idx !== -1) {
              student = batch.records[idx];
              foundBatch = batch;
              leafIdx = idx;
              break;
            }
          }
        }

        if (student && foundBatch && leafIdx !== -1) {
          const verified = await verifyByBatchAndLeaf(foundBatch.batchId, leafIdx);
          setIsVerifying(false);
          if (verified) return;
        }

        setIsVerifying(false);
        setUrlError(`Student PRN "${target}" was not found in the verified university degree registry.`);
        return;
      }
    } catch (e: any) {
      setIsVerifying(false);
      setUrlError("Verification error: " + (e?.message || "Invalid input data."));
    }
  };

  const verifyByBatchAndLeaf = async (batchId: string, leafIndex: number): Promise<boolean> => {
    try {
      // 1. Fetch from server public verification endpoint
      const res = await fetch(`/api/verify/${encodeURIComponent(batchId)}/${leafIndex}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.credential) {
          handleCredentialVerification(data.credential);
          return true;
        }
      }

      // 2. Client-side fallback from getStoredBatches()
      const batches = getStoredBatches();
      const foundBatch = batches.find(
        (b) => b.batchId.toLowerCase() === batchId.toLowerCase()
      );
      if (foundBatch && foundBatch.records && foundBatch.records[leafIndex]) {
        const student = foundBatch.records[leafIndex];
        const treeData = buildBatchMerkleTree(foundBatch.records);
        const proofData = {
          ...treeData.proofs[leafIndex],
          batchId: foundBatch.batchId,
          contractAddress: getSepoliaConfig().credentialRegistryAddress,
          network: "Ethereum Sepolia",
        };
        const cred = createW3CCredential(
          student,
          proofData,
          foundBatch.issuer,
          foundBatch.institutionName,
          foundBatch.institutionCode
        );
        handleCredentialVerification(cred);
        return true;
      }
    } catch (err) {
      console.warn("verifyByBatchAndLeaf error:", err);
    }
    return false;
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

  // Auto-verify credential passed via URL parameter (?verify=batchId/leafIndex or ?cred=... or ?data=...)
  useEffect(() => {
    const verifyParam = searchParams.get("verify") || searchParams.get("v");
    if (verifyParam) {
      const parts = verifyParam.replace(/^\/?api\/verify\//, "").split("/");
      if (parts.length >= 2) {
        const bId = parts[0];
        const lIdx = parseInt(parts[1], 10);
        if (bId && !isNaN(lIdx)) {
          verifyByBatchAndLeaf(bId, lIdx);
          return;
        }
      }
    }

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
      const batchId = credential.proof?.merkleProof?.batchId;
      const leafIndex = credential.proof?.merkleProof?.leafIndex;
      let url = "";
      if (batchId && leafIndex !== undefined && leafIndex !== null) {
        url = `${window.location.origin}/?verify=${encodeURIComponent(batchId)}/${leafIndex}`;
      } else {
        const jsonStr = JSON.stringify(credential);
        const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
        url = `${window.location.origin}/?cred=${encodeURIComponent(b64)}&verifier=true`;
      }
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
              <span>Verify via URL or PRN</span>
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
              <FileText className="h-4 w-4 text-blue-600" />
              <span>Verify via PDF</span>
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
                  Verify via Credential URL or PRN
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Paste the official verification URL or the student&apos;s Permanent Registration Number (PRN).
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
                    <span>{isVerifying ? "Verifying..." : "Verify Credential"}</span>
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
                    className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-lg text-xs font-semibold transition-all"
                  >
                    PRN20200102 (Ananya Malhotra)
                  </button>
                  <button
                    onClick={() => {
                      setInputUrl("PRN20200103");
                      handleVerifyPastedUrl("PRN20200103");
                    }}
                    className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold transition-all"
                  >
                    PRN20200103 (Rohan Kulkarni)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VERIFY VIA DEGREE PDF */}
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
                accept=".pdf,.json,application/pdf,application/json"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                className="hidden"
              />

              <div className="max-w-md mx-auto space-y-4">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs relative group">
                  <FileText className="h-8 w-8 text-blue-600" />
                  <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-4 ring-white animate-pulse" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    Verify via Degree PDF
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    Drag and drop your official university degree certificate PDF (.pdf) or digital credential (.json)
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
                    Select Degree Certificate PDF
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
                    <span>Aarav Sharma (CSE)</span>
                  </button>
                  <button
                    onClick={() => loadFixture("/fixtures/valid_degree_ananya_malhotra.json")}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-lg font-semibold transition-all shadow-2xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Ananya Malhotra (AI & DS)</span>
                  </button>
                  <button
                    onClick={() => loadFixture("/fixtures/valid_degree_rohan_kulkarni.json")}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-lg font-semibold transition-all shadow-2xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Rohan Kulkarni (IT)</span>
                  </button>
                  <button
                    onClick={() => loadFixture("/fixtures/tampered_degree_sample.json")}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-900 border border-red-200 rounded-lg font-semibold transition-all shadow-2xs flex items-center gap-1.5"
                  >
                    <XCircle className="h-3.5 w-3.5 text-red-600" />
                    <span>Tampered Sample (Invalid)</span>
                  </button>
                </div>

                {/* Pre-Generated Test PDF Degrees Suite */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className="text-slate-500 font-bold mr-1 flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Test Degree PDFs:</span>
                  </span>
                  <a
                    href="/certificates_pdf/1_Authentic_Degree_Aarav_Sharma.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-lg font-semibold transition-all flex items-center gap-1"
                    title="100% Valid degree on blockchain"
                  >
                    <span>Aarav (Authentic PDF)</span>
                  </a>
                  <a
                    href="/certificates_pdf/2_Authentic_Degree_Ananya_Malhotra.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-lg font-semibold transition-all flex items-center gap-1"
                    title="100% Valid degree on blockchain"
                  >
                    <span>Ananya (Authentic PDF)</span>
                  </a>
                  <a
                    href="/certificates_pdf/3_Tampered_GPA_Degree_Aarav_Sharma.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-900 border border-red-200 rounded-lg font-semibold transition-all flex items-center gap-1"
                    title="Altered CGPA: 9.92 vs genuine 9.24"
                  >
                    <span>Tampered GPA (PDF)</span>
                  </a>
                  <a
                    href="/certificates_pdf/4_Fake_Unregistered_Degree_Vikrant_Verma.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg font-semibold transition-all flex items-center gap-1"
                    title="Fabricated candidate not in university registry"
                  >
                    <span>Counterfeit (PDF)</span>
                  </a>
                  <a
                    href="/certificates_pdf/5_Revoked_Degree_Pooja_Patil.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg font-semibold transition-all flex items-center gap-1"
                    title="Degree revoked on blockchain"
                  >
                    <span>Revoked (PDF)</span>
                  </a>
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

              {/* Privacy-Preserving Credential Summary Badge */}
              <div className="pt-3 border-t border-emerald-200/70 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-white/80 p-3 rounded-xl border border-emerald-200 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                    Verified Issuing Institution:
                  </span>
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-blue-700 shrink-0" />
                    <span className="truncate">{typeof result.issuingInstitutionName === "string" ? result.issuingInstitutionName : typeof credential?.credentialSubject?.university === "string" ? credential.credentialSubject.university : "MGM University"}</span>
                  </div>
                </div>

                <div className="bg-white/80 p-3 rounded-xl border border-emerald-200 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                    Verified Degree Award:
                  </span>
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Award className="h-4 w-4 text-emerald-700 shrink-0" />
                    <span className="truncate">
                      {credential?.credentialSubject?.degree || "Bachelor of Technology"}
                    </span>
                  </div>
                </div>

                <div className="bg-white/80 p-3 rounded-xl border border-emerald-200 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                    Consortium On-Chain Authority:
                  </span>
                  <div className="text-xs font-mono font-bold text-emerald-950 flex items-center gap-1.5 mt-0.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Authenticated Inter-University Registry</span>
                  </div>
                </div>
              </div>

              {/* Zero-PII Privacy Protection Notice */}
              <div className="bg-emerald-100/60 border border-emerald-200/90 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-900">
                <Lock className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>
                  <strong>DPDP Act Zero-PII Privacy Protection:</strong> Candidate full transcript, grade marks, and sensitive personal identifiers are protected. Cryptographic Merkle verification confirms degree validity on Sepolia without exposing the student&apos;s private certificate.
                </span>
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
