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
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [aiReadiness, setAiReadiness] = useState<
    "checking" | "warming_up" | "online" | "busy" | "unavailable"
  >("checking");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const hasAutoTriggeredRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Background AI Readiness & Pre-Warming State Machine (Max 120s Bounded Polling)
  const isMountedRef = useRef(true);
  const isPollingRef = useRef(false);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const warmupStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    isMountedRef.current = true;
    warmupStartTimeRef.current = Date.now();

    const checkHealth = async () => {
      if (!isMountedRef.current || isPollingRef.current) return;

      const elapsed = Date.now() - warmupStartTimeRef.current;
      if (elapsed > 120_000) {
        if (isMountedRef.current) {
          setAiReadiness("unavailable");
        }
        return; // Bounded retry deadline reached (120s) - stop polling
      }

      isPollingRef.current = true;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch("/api/ai/health", {
          method: "GET",
          signal: controller.signal,
        });

        if (!isMountedRef.current) return;

        if (res.ok) {
          const data = await res.json();
          if (data && data.status === "online") {
            if (data.is_busy) {
              setAiReadiness("busy");
              // Continue polling every 5s while busy until worker clears
              pollTimeoutRef.current = setTimeout(checkHealth, 5000);
            } else {
              setAiReadiness("online");
              // Service is warmed and ready! Stop aggressive polling.
            }
            return;
          }
        }

        // Service offline or warming up (50-90s Render Free cold start window)
        if (elapsed <= 120_000) {
          setAiReadiness("warming_up");
          pollTimeoutRef.current = setTimeout(checkHealth, 5000);
        } else {
          setAiReadiness("unavailable");
        }
      } catch (err: any) {
        if (!isMountedRef.current) return;
        if (err?.name === "AbortError") return;

        if (Date.now() - warmupStartTimeRef.current <= 120_000) {
          setAiReadiness("warming_up");
          pollTimeoutRef.current = setTimeout(checkHealth, 5000);
        } else {
          setAiReadiness("unavailable");
        }
      } finally {
        isPollingRef.current = false;
      }
    };

    checkHealth();

    return () => {
      isMountedRef.current = false;
      hasAutoTriggeredRef.current = true;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

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

  const executePdfVerification = async (file: File) => {
    if (!isMountedRef.current || isVerifying) return; // Prevent duplicate concurrent executions or unmounted calls
    setIsVerifying(true);
    setVerificationStep(1);
    setResult(null);
    setCredential(null);
    setFileError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      await new Promise((r) => setTimeout(r, 200));
      if (!isMountedRef.current) return;
      setVerificationStep(2);

      const res = await fetch("/api/verify/pdf", {
        method: "POST",
        body: formData,
      });

      await new Promise((r) => setTimeout(r, 250));
      if (!isMountedRef.current) return;
      setVerificationStep(3);

      const data = await res.json();
      if (!isMountedRef.current) return;
      setIsVerifying(false);

      if (!res.ok || !data.success) {
        if (!isMountedRef.current) return;
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
        tamperReason: data.tamperReason || data.diagnostic_message,
        diagnosticCode: data.diagnostic_code,
        verificationOutcome: data.verification_outcome,
        visualAnalysisPending: Boolean(data.visual_analysis_pending || data.forensic_scan?.status === "QUEUED"),
        visualServiceOffline: Boolean(data.visual_service_offline || data.forensic_scan?.status === "UNAVAILABLE"),
        forensicScan: data.forensic_scan,
        semanticCheck: data.semantic_check,
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

      if (!isMountedRef.current) return;
      setResult(verificationResult);
      if (isFullyValid) {
        triggerConfetti();
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setIsVerifying(false);
      setFileError("Error communicating with verification service: " + (err?.message || "Unknown error"));
    }
  };

  const handleFileUpload = async (file: File) => {
    if (isVerifying) return; // Prevent duplicate concurrent submissions
    setFileError(null);
    const fileName = file.name.toLowerCase();

    // 1. PDF Degree Certificate Verification
    if (fileName.endsWith(".pdf") || file.type === "application/pdf") {
      if (aiReadiness === "online") {
        setPendingFile(null);
        hasAutoTriggeredRef.current = true;
        executePdfVerification(file);
      } else {
        // AI is checking, warming_up, busy, or unavailable:
        // Preserve selected file and display waiting / fallback message without starting PDF verification yet
        hasAutoTriggeredRef.current = false;
        setPendingFile(file);
      }
      return;
    }

    // 2. JSON W3C Verifiable Credential Payload
    if (fileName.endsWith(".json") || file.type === "application/json") {
      setPendingFile(null);
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

  // Auto-trigger verification when AI engine transitions to online and a PDF is pending
  useEffect(() => {
    if (!isMountedRef.current) return;
    if (aiReadiness === "online" && pendingFile && !isVerifying && !hasAutoTriggeredRef.current) {
      hasAutoTriggeredRef.current = true;
      const fileToVerify = pendingFile;
      setPendingFile(null);
      executePdfVerification(fileToVerify);
    }
  }, [aiReadiness, pendingFile, isVerifying]);

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
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.json,application/pdf,application/json"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                  e.target.value = "";
                }}
                className="hidden"
              />

              {isVerifying ? (
                /* Dedicated Active Document Scanner Screen */
                <div className="max-w-md mx-auto py-4 space-y-5">
                  <div className="relative mx-auto w-64 h-40 bg-slate-900 rounded-2xl border-2 border-blue-500/50 shadow-2xl p-4 flex flex-col justify-between overflow-hidden">
                    <div className="flex items-center justify-between text-white/80 border-b border-white/10 pb-2">
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <FileText className="h-4 w-4 text-blue-400" />
                        <span>DOCUMENT SCANNER</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold animate-pulse">ANALYZING...</span>
                    </div>
                    <div className="space-y-1.5 text-left font-mono text-[10px] text-slate-300">
                      <div className="h-1.5 w-3/4 bg-blue-500/40 rounded-full animate-pulse" />
                      <div className="h-1.5 w-1/2 bg-blue-400/30 rounded-full animate-pulse" />
                      <div className="h-1.5 w-5/6 bg-blue-500/20 rounded-full animate-pulse" />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-blue-300 font-mono border-t border-white/10 pt-2">
                      <span>CRYPTOGRAPHIC MERKLE PROOF</span>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-lg font-black text-slate-900 flex items-center justify-center gap-2">
                      <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
                      <span>Verifying Degree Certificate...</span>
                    </h4>
                    <div className="flex items-center justify-center gap-2 text-xs text-slate-600 font-medium">
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                      <span>
                        {verificationStep === 1
                          ? "Step 1/3: Extracting PDF Text & Claims..."
                          : verificationStep === 2
                          ? "Step 2/3: Validating Cryptographic Merkle Proof..."
                          : aiReadiness === "warming_up"
                          ? "Step 3/3: Evaluating Cryptographic Proof (AI is warming up in background)..."
                          : "Step 3/3: Evaluating Visual ELA Compression Residuals..."}
                      </span>
                    </div>
                  </div>
                </div>
              ) : pendingFile ? (
                /* Pending File Waiting / Fallback UI */
                <div className="max-w-md mx-auto space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs relative">
                    <FileText className="h-8 w-8 text-blue-600" />
                    {aiReadiness === "unavailable" ? (
                      <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-slate-400 ring-4 ring-white" />
                    ) : (
                      <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-500 ring-4 ring-white animate-pulse" />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 max-w-full truncate">
                      <FileText className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span className="font-semibold truncate">{pendingFile.name}</span>
                      <span className="text-slate-500 shrink-0">({(pendingFile.size / 1024).toFixed(1)} KB)</span>
                    </div>

                    {aiReadiness === "unavailable" ? (
                      <div className="space-y-2 pt-2">
                        <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                          AI Forensic Analysis Unavailable
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                          The AI forensic microservice could not be contacted within the 120s time limit. You can proceed with authoritative on-chain cryptographic Merkle verification without AI.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-2">
                        <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center justify-center gap-2">
                          <RefreshCw className="h-4 w-4 text-amber-600 animate-spin" />
                          <span>Certificate Queued for Verification</span>
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                          {aiReadiness === "busy"
                            ? "The AI forensic engine is currently processing another document. Verification will begin automatically once current inference finishes."
                            : "Waiting for the AI forensic engine to wake up before verifying (Render Free cold start takes ~50–90s). Verification will start automatically as soon as it is online."}
                        </p>
                      </div>
                    )}

                    {/* Compact AI Status Badge */}
                    <div className="flex items-center justify-center pt-1 pb-1">
                      <div
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
                          aiReadiness === "warming_up"
                            ? "bg-amber-50 text-amber-800 border-amber-200/80 shadow-2xs"
                            : aiReadiness === "busy"
                            ? "bg-blue-50 text-blue-800 border-blue-200/80 shadow-2xs"
                            : aiReadiness === "checking"
                            ? "bg-slate-50 text-slate-700 border-slate-200/80"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {aiReadiness === "warming_up" && (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 text-amber-600 animate-spin shrink-0" />
                            <span>AI engine is waking up...</span>
                          </>
                        )}
                        {aiReadiness === "busy" && (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 text-blue-600 animate-spin shrink-0" />
                            <span>AI engine busy with another document...</span>
                          </>
                        )}
                        {aiReadiness === "checking" && (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 text-slate-500 animate-spin shrink-0" />
                            <span>Checking AI forensic service...</span>
                          </>
                        )}
                        {aiReadiness === "unavailable" && (
                          <>
                            <AlertCircle className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                            <span>AI forensic service offline</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {fileError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-2 justify-center font-semibold">
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                      <span>{fileError}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    {aiReadiness === "unavailable" ? (
                      <button
                        onClick={() => {
                          if (isVerifying || !pendingFile) return;
                          hasAutoTriggeredRef.current = true;
                          const f = pendingFile;
                          setPendingFile(null);
                          executePdfVerification(f);
                        }}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-98 flex items-center gap-2"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>Verify Cryptographically (Without AI)</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (isVerifying || !pendingFile) return;
                          hasAutoTriggeredRef.current = true;
                          const f = pendingFile;
                          setPendingFile(null);
                          executePdfVerification(f);
                        }}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-98 flex items-center gap-2"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>Verify On-Chain Now (Skip AI Scan)</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setPendingFile(null);
                        hasAutoTriggeredRef.current = false;
                        setFileError(null);
                      }}
                      className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-all hover:scale-102 shadow-2xs"
                    >
                      Cancel / Choose Different File
                    </button>
                  </div>
                </div>
              ) : (
                /* Standard Dropzone UI */
                <div className="max-w-md mx-auto space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs relative group">
                    <FileText className="h-8 w-8 text-blue-600" />
                    <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-4 ring-white animate-pulse" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                      Verify via Degree PDF
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                      Drag and drop your official university degree certificate PDF (.pdf) or digital credential (.json)
                    </p>

                    {/* Compact Professional AI Service Readiness Indicator */}
                    <div className="flex items-center justify-center pt-1 pb-1">
                      <div
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
                          aiReadiness === "online"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200/80 shadow-2xs"
                            : aiReadiness === "warming_up"
                            ? "bg-amber-50 text-amber-800 border-amber-200/80 shadow-2xs"
                            : aiReadiness === "busy"
                            ? "bg-blue-50 text-blue-800 border-blue-200/80 shadow-2xs"
                            : aiReadiness === "checking"
                            ? "bg-slate-50 text-slate-700 border-slate-200/80"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {aiReadiness === "online" && (
                          <>
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span>AI forensic engine is online and ready.</span>
                          </>
                        )}
                        {aiReadiness === "warming_up" && (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 text-amber-600 animate-spin shrink-0" />
                            <span>AI forensic engine is waking up. This may take around 50–90 seconds.</span>
                          </>
                        )}
                        {aiReadiness === "busy" && (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 text-blue-600 animate-spin shrink-0" />
                            <span>AI forensic engine is processing another document. Please wait.</span>
                          </>
                        )}
                        {aiReadiness === "checking" && (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 text-slate-500 animate-spin shrink-0" />
                            <span>Checking AI forensic service...</span>
                          </>
                        )}
                        {aiReadiness === "unavailable" && (
                          <>
                            <AlertCircle className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                            <span>AI forensic analysis is currently unavailable.</span>
                          </>
                        )}
                      </div>
                    </div>
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
                </div>
              )}
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

          {/* ========================================================================= */}
          {/* TIER 1 & OVERALL VERIFICATION OUTCOME                                      */}
          {/* ========================================================================= */}

          {/* SUCCESS / CRYPTOGRAPHICALLY VALID STATE */}
          {result.isValid && !result.isRevoked && (() => {
            const isVisualAnomaly =
              result.forensicScan?.status === "COMPLETED" &&
              (result.forensicScan?.verdict === "SUSPICIOUS" || result.forensicScan?.verdict === "HIGH ANOMALY");
            const isVisualPending =
              result.visualAnalysisPending || result.forensicScan?.status === "QUEUED";
            const isVisualOffline =
              result.visualServiceOffline || result.forensicScan?.status === "UNAVAILABLE";
            const isFullyVerified =
              result.forensicScan?.status === "COMPLETED" &&
              (result.forensicScan?.verdict === "LOW ANOMALY" || result.forensicScan?.verdict === "AUTHENTIC");

            let cardBg = "bg-emerald-50 border-emerald-300";
            let iconBg = "bg-emerald-600";
            let titleColor = "text-emerald-950";
            let bannerTitle = "100% Authentic & Tamper-Proof";
            let subDescription = `Merkle root verified on Sepolia at ${result.verifiedAt}. Cryptographic Merkle proof, certified academic claims, and visual compression consistency checks all fully verified.`;

            if (isVisualAnomaly) {
              cardBg = "bg-amber-50/70 border-amber-300";
              iconBg = "bg-amber-600";
              titleColor = "text-amber-950";
              bannerTitle = "Authentic Blockchain Record • Visual Anomaly Advisory";
              subDescription = `Merkle root verified on Sepolia at ${result.verifiedAt}. Cryptographic claims match an authentic registered credential, but visual analysis detected localized compression discrepancies. Inspect the thermal heatmap below.`;
            } else if (isVisualPending) {
              cardBg = "bg-sky-50/70 border-sky-300";
              iconBg = "bg-sky-600";
              titleColor = "text-sky-950";
              bannerTitle = "Cryptographically Verified On-Chain • Visual Analysis Pending";
              subDescription = `Merkle root verified on Sepolia at ${result.verifiedAt}. Cryptographic claims match the authentic registered student record. Visual forensic analysis has been deferred to background runner or is currently queued.`;
            } else if (isVisualOffline) {
              cardBg = "bg-slate-50 border-slate-300";
              iconBg = "bg-slate-600";
              titleColor = "text-slate-950";
              bannerTitle = "Cryptographically Verified On-Chain • Advisory Visual Scan Offline";
              subDescription = `Merkle root verified on Sepolia at ${result.verifiedAt}. Cryptographic claims match the authentic registered student record. Advisory visual forensic scanning was unavailable or timed out.`;
            }

            return (
              <div className={`rounded-3xl p-6 shadow-sm space-y-4 border ${cardBg}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 text-white rounded-2xl shadow-md shrink-0 ${iconBg}`}>
                      {isVisualAnomaly ? (
                        <AlertCircle className="h-7 w-7" />
                      ) : (
                        <ShieldCheck className="h-7 w-7" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className={`text-lg font-extrabold ${titleColor}`}>
                          {bannerTitle}
                        </h4>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-full">
                          Blockchain: Verified On-Chain
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-full">
                          Claims: Certified Match
                        </span>
                        {isFullyVerified && (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-full">
                            Visual Forensics: Low Anomaly
                          </span>
                        )}
                        {isVisualAnomaly && (
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                            result.forensicScan?.verdict === "SUSPICIOUS" ? "bg-amber-200 text-amber-900" : "bg-red-200 text-red-900"
                          }`}>
                            Visual Forensics: {result.forensicScan?.verdict}
                          </span>
                        )}
                        {isVisualPending && (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-sky-200 text-sky-900 px-2.5 py-0.5 rounded-full">
                            Visual Forensics: Deferred / Pending
                          </span>
                        )}
                        {isVisualOffline && (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-800 px-2.5 py-0.5 rounded-full">
                            Visual Forensics: Service Offline
                          </span>
                        )}
                      </div>
                      <p className={`text-xs mt-1 leading-relaxed ${isVisualAnomaly ? "text-amber-900" : "text-slate-700"}`}>
                        {subDescription}
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
            </div>
          ); })()}

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

          {/* ========================================================================= */}
          {/* MECHANISM B: SEMANTIC CLAIM CONSISTENCY (FIELD-LEVEL AUDIT)                */}
          {/* Compares extracted certificate claims against the on-chain Merkle record  */}
          {/* ========================================================================= */}
          {result.semanticCheck && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div
                    className={`p-1.5 rounded-lg ${
                      result.semanticCheck.status === "MATCH"
                        ? "bg-emerald-100 text-emerald-700"
                        : result.semanticCheck.status === "MISMATCH"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <FileCheck2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">
                      Mechanism B &bull; Semantic Claim Consistency (Field-Level Audit)
                    </h5>
                    <span className="text-[10px] text-slate-500 font-mono block">
                      Cross-verifies document typography against authoritative Sepolia Merkle leaves
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      result.semanticCheck.status === "MATCH"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : result.semanticCheck.status === "MISMATCH"
                        ? "bg-rose-100 text-rose-800 border border-rose-300"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                    }`}
                  >
                    {result.semanticCheck.status === "MATCH"
                      ? "CLAIMS CONSISTENT (100% MATCH)"
                      : result.semanticCheck.status === "MISMATCH"
                      ? "SEMANTIC CLAIM MISMATCH"
                      : "AUDIT SKIPPED"}
                  </span>
                </div>
              </div>

              {/* Mismatch Alert Banner */}
              {result.semanticCheck.status === "MISMATCH" && result.semanticCheck.field_mismatches && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 text-rose-900 font-bold">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    <span>Discrepancy Warning: {result.semanticCheck.field_mismatches.length} field(s) diverge from certified blockchain record:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-rose-800 pl-1">
                    {result.semanticCheck.field_mismatches.map((m, idx) => (
                      <li key={idx} className="leading-relaxed">
                        <strong className="font-semibold text-rose-950">{m.field}:</strong> Document claims &ldquo;{String(m.claimed)}&rdquo;, but certified on-chain record anchors &ldquo;{String(m.certified)}&rdquo;.
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Field Comparison Grid */}
              {(result.semanticCheck.claimed || result.semanticCheck.certified) && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-100 rounded-xl overflow-hidden">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="py-2 px-3">Field Attribute</th>
                        <th className="py-2 px-3">Document Claim</th>
                        <th className="py-2 px-3">Certified On-Chain Anchor</th>
                        <th className="py-2 px-3 text-right">Integrity Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {[
                        {
                          label: "Candidate Name",
                          claimed: result.semanticCheck.claimed?.studentName,
                          certified: result.semanticCheck.certified?.studentName,
                        },
                        {
                          label: "Permanent Reg. No (PRN)",
                          claimed: result.semanticCheck.claimed?.prn,
                          certified: result.semanticCheck.certified?.prn,
                        },
                        {
                          label: "Cumulative CGPA",
                          claimed:
                            result.semanticCheck.claimed?.cgpa !== undefined
                              ? Number(result.semanticCheck.claimed.cgpa).toFixed(2)
                              : undefined,
                          certified:
                            result.semanticCheck.certified?.cgpa !== undefined
                              ? Number(result.semanticCheck.certified.cgpa).toFixed(2)
                              : undefined,
                        },
                        {
                          label: "Degree Conferred",
                          claimed: result.semanticCheck.claimed?.degree,
                          certified: result.semanticCheck.certified?.degree,
                        },
                        {
                          label: "Branch / Discipline",
                          claimed: result.semanticCheck.claimed?.branch,
                          certified: result.semanticCheck.certified?.branch,
                        },
                        {
                          label: "Graduation Year",
                          claimed: result.semanticCheck.claimed?.graduationYear,
                          certified: result.semanticCheck.certified?.graduationYear,
                        },
                      ].map((item, idx) => {
                        const isMismatch = result.semanticCheck?.field_mismatches?.some((m) =>
                          m.field.toLowerCase().includes(item.label.toLowerCase().slice(0, 5))
                        );
                        return (
                          <tr
                            key={idx}
                            className={
                              isMismatch
                                ? "bg-rose-50/60"
                                : idx % 2 === 0
                                ? "bg-white"
                                : "bg-slate-50/40"
                            }
                          >
                            <td className="py-2 px-3 font-sans font-medium text-slate-700">
                              {item.label}
                            </td>
                            <td className="py-2 px-3 text-slate-900 font-semibold">
                              {item.claimed ?? (
                                <span className="text-slate-400 font-normal italic">Inconclusive (Not Extracted)</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{item.certified ?? "N/A"}</td>
                            <td className="py-2 px-3 text-right">
                              {isMismatch ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                                  <XCircle className="h-3 w-3" /> Mismatch
                                </span>
                              ) : item.claimed && item.certified ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 className="h-3 w-3" /> Verified Match
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                  Inconclusive
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* MECHANISM C: DOCUMENT FORENSIC ANALYSIS (ERROR LEVEL ANALYSIS)             */}
          {/* Rendered in ALL verification states when a forensic scan is attached      */}
          {/* ========================================================================= */}
          {result.forensicScan && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">
                      Mechanism C &bull; Visual Forensic Analysis (Error Level Analysis)
                    </h5>
                    <span className="text-[10px] text-slate-500 font-mono block">
                      {result.forensicScan.metadata?.forensic_mode === "TRAINED_INFERENCE" && result.forensicScan.metadata?.model_trained
                        ? "Operational Mode: Trained PyTorch ELA CNN Inference"
                        : "Operational Mode: Heuristic Compression Forensics (Untrained Baseline)"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {result.forensicScan.status === "COMPLETED" ? (
                    <>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          result.forensicScan.verdict === "LOW ANOMALY" || result.forensicScan.verdict === "AUTHENTIC"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : result.forensicScan.verdict === "SUSPICIOUS"
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : "bg-red-100 text-red-800 border border-red-300"
                        }`}
                      >
                        Forensic Verdict: {result.forensicScan.verdict}
                      </span>
                      {result.forensicScan.heatmap_base64 && (
                        <button
                          type="button"
                          onClick={() => setShowHeatmap(!showHeatmap)}
                          className="text-[10px] font-bold text-blue-700 hover:text-blue-900 underline ml-1 cursor-pointer"
                        >
                          {showHeatmap ? "Hide Thermal ELA Map" : "View Thermal ELA Map"}
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                      Forensics Standby ({result.forensicScan.reason || "Microservice Offline"})
                    </span>
                  )}
                </div>
              </div>

              {result.forensicScan.status === "COMPLETED" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Anomaly Probability:</span>
                      <strong className="text-slate-900">
                        {((result.forensicScan.ai_confidence_score || 0) * 100).toFixed(1)}%
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Residual Std Dev (&sigma;):</span>
                      <strong className="text-slate-900">
                        {result.forensicScan.metadata?.anomaly_std_dev ?? "N/A"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Localized Peak Z-Score:</span>
                      <strong className="text-slate-900">
                        {result.forensicScan.metadata?.localized_tile_peak_zscore ?? "N/A"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Compute / Engine:</span>
                      <strong className="text-slate-900 truncate block">
                        {result.forensicScan.metadata?.compute_device?.toUpperCase() || "CPU"} &bull; 64 Tiles
                      </strong>
                    </div>
                  </div>

                  {Array.isArray(result.forensicScan.metadata?.localized_suspicious_regions) &&
                    result.forensicScan.metadata.localized_suspicious_regions.length > 0 && (
                      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs space-y-1.5">
                        <div className="flex items-center gap-1.5 text-amber-900 font-bold text-[11px]">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span>
                            Localized Compression Anomaly Hotspots (
                            {result.forensicScan.metadata.localized_suspicious_regions.length} tile(s) detected):
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-0.5 font-mono text-[10px]">
                          {result.forensicScan.metadata.localized_suspicious_regions.map(
                            (tile: any, tIdx: number) => (
                              <span
                                key={tIdx}
                                className="bg-white px-2 py-0.5 rounded border border-amber-300 text-amber-900 shadow-2xs"
                              >
                                Grid [{tile.grid_row},{tile.grid_col}] &bull; Z: {tile.z_score} &bull; Mean:{" "}
                                {tile.tile_mean}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                  {showHeatmap && result.forensicScan.heatmap_base64 && (
                    <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 block uppercase">
                        Error Level Analysis (ELA) Compression Thermal Heatmap (JET Colormap Overlay):
                      </span>
                      <div className="rounded-lg overflow-hidden border border-slate-200 max-h-96 flex items-center justify-center bg-slate-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={result.forensicScan.heatmap_base64}
                          alt="ELA Thermal Tampering Heatmap"
                          className="max-h-96 w-auto object-contain"
                        />
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-500 leading-normal italic">
                    {result.forensicScan.metadata?.disclaimer ||
                      "Visual forensic analysis evaluates JPEG compression anomalies (Error Level Analysis) using localized spatial heuristics. In the absence of a fine-tuned checkpoint, this operates as an untrained heuristic baseline. Cryptographic Merkle tree verification on Ethereum Sepolia remains the authoritative ground truth."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Render Multi-Tab Official Certificate Card */}
          {credential && result.isValid && (
            <div className="pt-2 animate-in fade-in duration-300">
              <DegreeCertificate
                credential={credential}
                verification={result}
                onShowQr={() => setIsQrModalOpen(true)}
              />
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
