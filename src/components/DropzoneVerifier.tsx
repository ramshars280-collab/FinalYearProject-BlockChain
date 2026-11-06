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
import CredentialVerificationReport from "./CredentialVerificationReport";
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
  const [aiReadiness, setAiReadiness] = useState<
    "checking" | "warming_up" | "online" | "busy" | "unavailable"
  >("checking");
  const aiReadinessRef = useRef<
    "checking" | "warming_up" | "online" | "busy" | "unavailable"
  >("checking");
  const activeScanIdRef = useRef<string | null>(null);
  const primaryAbortControllerRef = useRef<AbortController | null>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const aiPollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Background AI Readiness & Pre-Warming State Machine (Max 120s Bounded Polling)
  const isMountedRef = useRef(true);
  const isPollingRef = useRef(false);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const warmupStartTimeRef = useRef<number>(Date.now());

  const setAiStatus = (status: "checking" | "warming_up" | "online" | "busy" | "unavailable") => {
    aiReadinessRef.current = status;
    setAiReadiness(status);
  };

  useEffect(() => {
    isMountedRef.current = true;
    warmupStartTimeRef.current = Date.now();

    const checkHealth = async () => {
      if (!isMountedRef.current || isPollingRef.current) return;

      const elapsed = Date.now() - warmupStartTimeRef.current;
      if (elapsed > 120_000) {
        if (isMountedRef.current) {
          setAiStatus("unavailable");
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
          if (data && (data.status === "online" || data.readiness === "READY")) {
            if (data.is_busy || data.readiness === "BUSY") {
              setAiStatus("busy");
              // Continue polling every 5s while busy until worker clears
              pollTimeoutRef.current = setTimeout(checkHealth, 5000);
            } else {
              setAiStatus("online");
              // Service is warmed and ready! Stop aggressive polling.
            }
            return;
          }
          if (data && (data.status === "warming_up" || data.readiness === "WARMING_UP" || data.readiness === "STARTING")) {
            if (elapsed <= 120_000) {
              setAiStatus("warming_up");
              pollTimeoutRef.current = setTimeout(checkHealth, 5000);
              return;
            }
          }
        }

        // Service offline or warming up (50-90s Render Free cold start window)
        if (elapsed <= 120_000) {
          setAiStatus("warming_up");
          pollTimeoutRef.current = setTimeout(checkHealth, 5000);
        } else {
          setAiStatus("unavailable");
        }
      } catch (err: any) {
        if (!isMountedRef.current) return;
        if (err?.name === "AbortError") return;

        if (Date.now() - warmupStartTimeRef.current <= 120_000) {
          setAiStatus("warming_up");
          pollTimeoutRef.current = setTimeout(checkHealth, 5000);
        } else {
          setAiStatus("unavailable");
        }
      } finally {
        isPollingRef.current = false;
      }
    };

    checkHealth();

    return () => {
      isMountedRef.current = false;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (primaryAbortControllerRef.current) primaryAbortControllerRef.current.abort();
      if (aiAbortControllerRef.current) aiAbortControllerRef.current.abort();
      if (aiPollTimeoutRef.current) clearTimeout(aiPollTimeoutRef.current);
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
        network: onChainCheck.networkName || (onChainCheck.onChainVerified ? "Ethereum Sepolia (11155111)" : "Institutional Database Registry (Off-Chain)"),
        verifiedAt: new Date().toLocaleTimeString(),
        issuingInstitutionName: onChainCheck.issuingInstitutionName || data.issuer?.name || subject.university,
        issuingInstitutionAddress: onChainCheck.issuingInstitutionAddress || data.issuer?.ethereumAddress,
        verificationSource: onChainCheck.source,
        isOnChainAnchored: Boolean(onChainCheck.onChainVerified),
        batchStatus: onChainCheck.batchStatus,
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

  const dispatchIndependentAiForensic = async (file: File, scanId: string) => {
    // If a newer upload occurred or unmounted, abort
    if (activeScanIdRef.current !== scanId || !isMountedRef.current) return;

    const runAiInference = async () => {
      if (activeScanIdRef.current !== scanId || !isMountedRef.current) return;

      // Update state to ANALYZING when inference starts
      setResult((prev) => {
        if (!prev || activeScanIdRef.current !== scanId) return prev;
        return {
          ...prev,
          forensicScan: {
            status: "ANALYZING",
            reason: "Performing ELA manipulation analysis",
          },
          visualAnalysisPending: true,
        };
      });

      const controller = new AbortController();
      aiAbortControllerRef.current = controller;

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/verify/ai", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (!isMountedRef.current || activeScanIdRef.current !== scanId) return;

        if (res.ok) {
          const data = await res.json();
          if (!isMountedRef.current || activeScanIdRef.current !== scanId) return;

          if (data && data.success && data.forensic_scan) {
            setResult((prev) => {
              if (!prev || activeScanIdRef.current !== scanId) return prev;
              return {
                ...prev,
                forensicScan: data.forensic_scan,
                visualAnalysisPending: false,
                visualServiceOffline: data.forensic_scan.status === "UNAVAILABLE",
              };
            });
            return;
          }
        }

        // Non-OK response fallback
        setResult((prev) => {
          if (!prev || activeScanIdRef.current !== scanId) return prev;
          return {
            ...prev,
            forensicScan: {
              status: "UNAVAILABLE",
              reason: "Forensic engine unavailable",
            },
            visualAnalysisPending: false,
            visualServiceOffline: true,
          };
        });
      } catch (err: any) {
        if (err?.name === "AbortError" || activeScanIdRef.current !== scanId || !isMountedRef.current) return;
        setResult((prev) => {
          if (!prev || activeScanIdRef.current !== scanId) return prev;
          return {
            ...prev,
            forensicScan: {
              status: "FAILED",
              reason: "Forensic analysis failed",
            },
            visualAnalysisPending: false,
            visualServiceOffline: false,
          };
        });
      }
    };

    // 1. If AI is already online, run inference immediately!
    if (aiReadinessRef.current === "online") {
      await runAiInference();
      return;
    }

    // 2. If AI is confirmed unavailable, mark unavailable
    if (aiReadinessRef.current === "unavailable") {
      setResult((prev) => {
        if (!prev || activeScanIdRef.current !== scanId) return prev;
        return {
          ...prev,
          forensicScan: {
            status: "UNAVAILABLE",
            reason: "Forensic engine unavailable",
          },
          visualAnalysisPending: false,
          visualServiceOffline: true,
        };
      });
      return;
    }

    // 3. If warming_up, checking, or busy:
    // Mark WARMING_UP and poll /api/ai/health every 5 seconds until online or bounded deadline (120s)
    setResult((prev) => {
      if (!prev || activeScanIdRef.current !== scanId) return prev;
      return {
        ...prev,
        forensicScan: {
          status: "WARMING_UP",
          reason: "Initializing forensic engine",
        },
        visualAnalysisPending: true,
      };
    });

    const pollStartTime = Date.now();
    const pollForReady = async () => {
      if (activeScanIdRef.current !== scanId || !isMountedRef.current) return;

      if (Date.now() - pollStartTime > 120_000) {
        setResult((prev) => {
          if (!prev || activeScanIdRef.current !== scanId) return prev;
          return {
            ...prev,
            forensicScan: {
              status: "UNAVAILABLE",
              reason: "Forensic engine unavailable (cold-start timeout exceeded)",
            },
            visualAnalysisPending: false,
            visualServiceOffline: true,
          };
        });
        return;
      }

      try {
        const res = await fetch("/api/ai/health");
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === "online" && !data.is_busy) {
            setAiStatus("online");
            await runAiInference();
            return;
          }
        }
      } catch {
        // Continue polling
      }

      if (activeScanIdRef.current === scanId && isMountedRef.current) {
        aiPollTimeoutRef.current = setTimeout(pollForReady, 5000);
      }
    };

    aiPollTimeoutRef.current = setTimeout(pollForReady, 5000);
  };

  const executePdfVerification = async (file: File, scanId: string) => {
    if (!isMountedRef.current) return;
    setIsVerifying(true);
    setVerificationStep(1);
    setResult(null);
    setCredential(null);
    setFileError(null);

    const controller = new AbortController();
    primaryAbortControllerRef.current = controller;

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("skip_ai", "true");

      await new Promise((r) => setTimeout(r, 150));
      if (!isMountedRef.current || activeScanIdRef.current !== scanId) return;
      setVerificationStep(2);

      const res = await fetch("/api/verify/pdf?skip_ai=true", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      await new Promise((r) => setTimeout(r, 150));
      if (!isMountedRef.current || activeScanIdRef.current !== scanId) return;
      setVerificationStep(3);

      const data = await res.json();
      if (!isMountedRef.current || activeScanIdRef.current !== scanId) return;
      setIsVerifying(false);

      if (!res.ok || !data.success) {
        if (!isMountedRef.current || activeScanIdRef.current !== scanId) return;
        if (
          data.verification_outcome === "INCONCLUSIVE" ||
          data.diagnostic_code === "SCANNED_DOCUMENT_REQUIRES_OCR" ||
          data.diagnostic_code === "RECORD_NOT_IN_DATABASE"
        ) {
          setResult({
            isValid: false,
            isRevoked: false,
            tamperDetected: false,
            tamperReason: data.error,
            diagnosticCode: data.diagnostic_code,
            verificationOutcome: "INCONCLUSIVE",
            verifiedAt: new Date().toLocaleTimeString(),
          });
          return;
        }
        setFileError(
          data.error ||
            "Invalid certificate format: The uploaded PDF is not a recognized university degree certificate."
        );
        return;
      }

      if (data.credential) {
        setCredential(data.credential);
      }

      const isFullyValid =
        data.isValid !== false &&
        !data.isRevoked &&
        !data.tamperDetected &&
        data.verification_outcome !== "INCONCLUSIVE";

      const isOnChain = Boolean(data.on_chain_verification?.onChainVerified ?? data.onChainCheck?.onChainVerified);
      const vSource = data.on_chain_verification?.source || data.onChainCheck?.source || "STORAGE_REGISTRY";
      const resolvedNetwork = data.onChainCheck?.networkName || (isOnChain ? (vSource === "LOCAL_RPC" ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)") : "Institutional Database Registry (Off-Chain)");

      setResult((prev) => {
        // Safe state merge: preserve any existing forensic progress if already received from parallel scan
        const currentForensic: any =
          prev?.forensicScan && prev.forensicScan.status !== "QUEUED"
            ? prev.forensicScan
            : aiReadinessRef.current === "online"
            ? { status: "ANALYZING", reason: "Performing ELA manipulation analysis" }
            : aiReadinessRef.current === "unavailable"
            ? { status: "UNAVAILABLE", reason: "Forensic engine unavailable" }
            : { status: "WARMING_UP", reason: "Initializing forensic engine" };

        const verificationResult: VerificationResult = {
          isValid: isFullyValid,
          isRevoked: Boolean(data.isRevoked),
          tamperDetected: Boolean(data.tamperDetected),
          tamperReason: data.tamperReason || data.diagnostic_message,
          diagnosticCode: data.diagnostic_code,
          verificationOutcome: data.verification_outcome,
          credentialAuthenticity: data.credential_authenticity || (isFullyValid ? "VERIFIED" : data.isRevoked ? "REVOKED" : "INVALID"),
          visualAnalysisPending: currentForensic.status === "ANALYZING" || currentForensic.status === "WARMING_UP" || currentForensic.status === "QUEUED",
          visualServiceOffline: currentForensic.status === "UNAVAILABLE",
          forensicScan: currentForensic,
          semanticCheck: data.semantic_check,
          computedLeaf: data.credential?.proof?.merkleProof?.leafHash,
          matchedRoot: data.credential?.proof?.merkleProof?.rootHash,
          batchId: data.pdfExtracted?.batchId,
          leafIndex: data.pdfExtracted?.leafIndex,
          credential: data.credential,
          network: resolvedNetwork,
          verifiedAt: new Date().toLocaleTimeString(),
          issuingInstitutionName:
            data.credential?.issuer?.name || "MGM University, Chhatrapati Sambhajinagar",
          issuingInstitutionAddress: data.credential?.issuer?.ethereumAddress,
          verificationSource: vSource,
          isOnChainAnchored: isOnChain,
          batchStatus: data.onChainCheck?.batchStatus,
        };
        return verificationResult;
      });

      if (isFullyValid) {
        triggerConfetti();
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || activeScanIdRef.current !== scanId || !isMountedRef.current) return;
      setIsVerifying(false);
      setFileError("Error communicating with verification service: " + (err?.message || "Unknown error"));
    }
  };

  const handleFileUpload = async (file: File) => {
    setFileError(null);
    const fileName = file.name.toLowerCase();

    // Abort any active prior in-flight verification
    if (primaryAbortControllerRef.current) {
      primaryAbortControllerRef.current.abort();
    }
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
    }
    if (aiPollTimeoutRef.current) {
      clearTimeout(aiPollTimeoutRef.current);
      aiPollTimeoutRef.current = null;
    }

    // Generate unique scan ID to prevent stale overwrites
    const scanId = `${file.name}-${file.size}-${file.lastModified}-${Date.now()}`;
    activeScanIdRef.current = scanId;

    // 1. PDF Degree Certificate Verification
    if (fileName.endsWith(".pdf") || file.type === "application/pdf") {
      // Immediately start cryptographic verification and AI scan independently in parallel
      executePdfVerification(file, scanId);
      dispatchIndependentAiForensic(file, scanId);
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
                          : "Step 3/3: Evaluating Cryptographic Proof on Ethereum..."}
                      </span>
                    </div>
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

      {/* Credential Verification Report Dashboard (Replaces Full Degree Certificate) */}
      {result && !isVerifying && (
        <div className="pt-2 animate-in fade-in duration-300">
          <CredentialVerificationReport
            result={result}
            credential={credential}
            onVerifyAnother={() => {
              setResult(null);
              setCredential(null);
              setInputUrl("");
              setUrlError(null);
              setFileError(null);
            }}
          />
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
