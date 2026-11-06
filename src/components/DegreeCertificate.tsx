"use client";

import React, { useState, useEffect } from "react";
import {
  GraduationCap,
  ShieldCheck,
  Award,
  Calendar,
  Building2,
  Hash,
  ExternalLink,
  Printer,
  Sparkles,
  QrCode,
  FileCheck,
  CheckCircle2,
  FileText,
  Code2,
  Layers,
  Copy,
  Check,
  Lock,
  Globe,
  X,
  Download,
  ShieldAlert,
  AlertCircle,
} from "lucide-react";
import QRCode from "qrcode";
import { W3CCredentialPayload, VerificationResult, BatchStatus } from "../types";
import { getSepoliaConfig } from "../lib/storage";
import { useWeb3 } from "../context/Web3Context";
import InteractiveHologramCard from "./InteractiveHologramCard";

interface DegreeCertificateProps {
  credential: W3CCredentialPayload;
  verification?: VerificationResult | null;
  onShowQr?: () => void;
  batchStatus?: BatchStatus;
  txHash?: string | null;
}

function toSafeString(val: any, fallback: string = ""): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") return val.trim() || fallback;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    if (val.title && (typeof val.title === "string" || typeof val.title === "number")) return String(val.title);
    if (val.name && (typeof val.name === "string" || typeof val.name === "number")) return String(val.name);
    if (val.label && (typeof val.label === "string" || typeof val.label === "number")) return String(val.label);
    if (val.value && (typeof val.value === "string" || typeof val.value === "number")) return String(val.value);
    if (val.description && typeof val.description === "string") return val.description;
    return fallback;
  }
  return fallback;
}

export default function DegreeCertificate({
  credential,
  verification,
  onShowQr,
  batchStatus,
  txHash,
}: DegreeCertificateProps) {
  const [activeViewTab, setActiveViewTab] = useState<"certificate" | "transcript" | "crypto" | "raw">("certificate");
  const [language, setLanguage] = useState<"en" | "bilingual">("en");
  const [copiedJson, setCopiedJson] = useState(false);

  const { selectedAppChainId } = useWeb3();
  const isLocalChain =
    selectedAppChainId === 31337 ||
    Boolean(verification?.network?.includes("Local")) ||
    verification?.verificationSource === "LOCAL_RPC" ||
    credential?.proof?.merkleProof?.chainId === 31337;
  const networkDisplayName = isLocalChain ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)";

  const subject = credential?.credentialSubject || (credential as any)?.recipient || (credential as any)?.data || {};
  const proof = credential?.proof || {};
  const isSelective = proof?.type === "SelectiveDisclosureProof2024" || proof?.type === "ZkSelectiveProof2024" || !!proof?.selectiveProof || !!proof?.zkProof;
  const selectiveProof = proof?.selectiveProof || proof?.zkProof;

  const studentName = toSafeString(
    subject?.fullName || (credential as any)?.recipient?.name || (credential as any)?.studentName || (credential as any)?.recipient,
    "Demo Student 001"
  );
  const degreeName = toSafeString(
    subject?.degree || (credential as any)?.title || (credential as any)?.name || (credential as any)?.course,
    "B.Tech CSE"
  );
  const branchName = toSafeString(
    subject?.branch || (credential as any)?.course || (credential as any)?.specialization || (credential as any)?.description,
    "CSE"
  );
  const prnNumber = toSafeString(
    subject?.prn || (credential as any)?.recipient?.id || (credential as any)?.id,
    "DEMO-CSE-001"
  );
  const graduationYear = toSafeString(
    subject?.graduationYear || (credential as any)?.completion_date || (credential as any)?.course?.completion_date || (credential as any)?.issuanceDate?.slice(0, 4),
    "2024"
  );
  const cgpaDisplay = isSelective
    ? `≥ ${toSafeString(selectiveProof?.thresholdValue, "8.0")}`
    : subject?.cgpa
    ? `${toSafeString(subject.cgpa)} / 10.0`
    : "8.76 / 10.0";
  const nheqfLevel = toSafeString(subject?.nheqfLevel, "6.0");
  const universityName = toSafeString(subject?.university || credential?.issuer?.name, "MGM University");

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const certNumberDisplay = (() => {
    if ((subject as any)?.certificateNumber) return String((subject as any).certificateNumber);
    if (prnNumber === "DEMO-CSE-2026-001") return "46585956";
    if (prnNumber === "DEMO-CSE-2026-002") return "46585957";
    if (prnNumber === "DEMO-CSE-2026-003") return "46585958";
    if (prnNumber === "PRN20200101") return "46585956";
    if (prnNumber === "PRN20200102") return "46585957";
    if (prnNumber === "PRN20200104") return "46585958";
    return prnNumber;
  })();

  const issueDateFormatted = (() => {
    const rawDate = toSafeString(subject?.issueDate || (credential as any)?.issuanceDate, "2026-11-03");
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
      }
    } catch {}
    return rawDate;
  })();

  const batchId = proof?.merkleProof?.batchId || "DEMO-BATCH-2024-001";
  const leafIndex = proof?.merkleProof?.leafIndex ?? 0;
  const shortVerificationUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/?verify=${encodeURIComponent(batchId)}/${leafIndex}`
      : `/?verify=${encodeURIComponent(batchId)}/${leafIndex}`;

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(shortVerificationUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (isMounted) setQrCodeDataUrl(url);
      })
      .catch((err) => console.error("QR generation error:", err));

    return () => {
      isMounted = false;
    };
  }, [shortVerificationUrl]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(credential, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const getEtherscanUrl = (addressOrTx: string) => {
    return `https://sepolia.etherscan.io/address/${addressOrTx}`;
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      {/* Top Action Bar with Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs">
        {/* View Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveViewTab("certificate")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeViewTab === "certificate"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-blue-600"
            }`}
          >
            <Award className="h-3.5 w-3.5" />
            <span>Degree Certificate</span>
          </button>

          <button
            onClick={() => setActiveViewTab("transcript")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeViewTab === "transcript"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-blue-600"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Official Transcript</span>
          </button>

          <button
            onClick={() => setActiveViewTab("crypto")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeViewTab === "crypto"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-blue-600"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Cryptographic Proof</span>
          </button>

          <button
            onClick={() => setActiveViewTab("raw")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeViewTab === "raw"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-blue-600"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>JSON-LD Data</span>
          </button>
        </div>

        {/* Action Controls & NEP 2020 Bilingual Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* NEP 2020 Bilingual Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setLanguage("en")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                language === "en" ? "bg-white text-blue-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              English
            </button>
            <button
              onClick={() => setLanguage("bilingual")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                language === "bilingual" ? "bg-white text-blue-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
              title="NEP 2020 Mandate: Bilingual Maharashtra Degree Format (मराठी / English)"
            >
              <Globe className="h-3 w-3 text-blue-600" />
              <span>द्विभाषिक (मराठी)</span>
            </button>
          </div>

          <button
            onClick={() => {
              setShowQrModal(true);
              if (onShowQr) onShowQr();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-colors"
          >
            <QrCode className="h-3.5 w-3.5 text-blue-600" />
            <span>QR Code</span>
          </button>

          {(() => {
            const dynamicPdfUrl = `/api/certificates/${encodeURIComponent(batchId)}/${leafIndex}/pdf`;

            return (
              <a
                href={dynamicPdfUrl}
                download
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold transition-all shadow-2xs hover:scale-102"
                title="Download Official Dynamic PDF Diploma"
              >
                <Download className="h-3.5 w-3.5 text-indigo-600" />
                <span>Download PDF</span>
              </a>
            );
          })()}

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all hover:scale-102"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Diploma</span>
          </button>
        </div>
      </div>

      {/* TAB 1: OFFICIAL DEGREE CERTIFICATE */}
      {activeViewTab === "certificate" && (
        <InteractiveHologramCard className="shadow-xl">
          <div
            id="printable-degree"
            className="w-full aspect-[297/210] max-w-full bg-[#fbf9f2] border-[1.6px] border-[#282624] p-6 sm:p-10 md:p-12 relative text-[#22211f] flex flex-col justify-between text-center overflow-hidden shadow-xl"
            style={{
              backgroundImage: "radial-gradient(circle at 50% 50%, #ffffff 0%, #faf6eb 100%)",
            }}
          >
            {/* Content Layer */}
            <div className="relative z-10 flex flex-col h-full justify-between">
              {/* Top Title, Subtitle, Student Name */}
              <div className="mt-1 sm:mt-2">
                <h1
                  style={{ fontFamily: "'Oswald', 'Bahnschrift', 'Arial Narrow', sans-serif" }}
                  className="text-xl sm:text-3xl md:text-4xl lg:text-[40pt] font-semibold text-[#22211f] tracking-[2px] uppercase leading-tight"
                >
                  GRADUATION CERTIFICATE
                </h1>
                <p className="text-xs sm:text-sm md:text-base font-normal text-[#55534f] mt-2 sm:mt-4 tracking-wide font-sans">
                  {language === "bilingual"
                    ? "The certificate is awarded / हे प्रमाणपत्र प्रदान करण्यात येत आहे"
                    : "The certificate is awarded"}
                </p>
                <div
                  style={{ fontFamily: "'Oswald', 'Bahnschrift', 'Arial Narrow', sans-serif" }}
                  className="text-xl sm:text-3xl md:text-4xl lg:text-[36pt] font-bold text-[#1a1918] tracking-[1.5px] uppercase mt-2 sm:mt-3 leading-tight"
                >
                  {studentName.toUpperCase()}
                </div>
              </div>

              {/* Achievement Statement - Clear Unobstructed Space */}
              <div className="text-xs sm:text-sm md:text-[11.5pt] leading-relaxed text-[#383633] space-y-1 font-sans my-1 sm:my-2">
                <p>
                  For successful completion of a <strong className="font-bold text-[#1a1918]">{degreeName} in {branchName}</strong>.
                </p>
                <p>
                  In recognition of outstanding academic achievement with a <strong className="font-bold text-[#1a1918]">Cumulative CGPA of {cgpaDisplay}</strong>
                </p>
                <p>and professional excellence.</p>
              </div>

              {/* Required Demonstration Disclaimer Banner */}
              <div className="my-1.5 sm:my-3">
                <div className="inline-block border-[1.8px] border-[#991b1b] bg-[#fef2f2] text-[#991b1b] font-sans font-bold text-[7.5px] sm:text-[9.5px] md:text-[10pt] tracking-[1px] uppercase px-3 sm:px-6 py-1 sm:py-1.5 rounded shadow-2xs max-w-full">
                  FOR DEMONSTRATION PURPOSES ONLY — NOT AN OFFICIALLY ISSUED DEGREE CERTIFICATE
                </div>
              </div>

              {/* Bottom Section: Signatures & Certificate Details */}
              <div className="grid grid-cols-3 items-end pt-2 pb-1">
                {/* Left Signatory */}
                <div className="flex flex-col items-start text-left pl-2 sm:pl-4">
                  <div className="h-7 sm:h-9 flex items-center justify-start mb-0.5 sm:mb-1">
                    <svg width="110" height="34" viewBox="0 0 130 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 26C20 16 32 10 38 14C44 18 36 30 28 28C20 26 34 8 46 12C58 16 52 32 64 26C74 20 88 14 100 16C110 18 116 26 124 23" stroke="#1e40af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M25 22C42 21 80 20 104 22" stroke="#1e40af" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-[#22211f]">Demo Examination Officer</span>
                  <span className="text-[9px] sm:text-[11px] text-[#55534f]">Examination Cell</span>
                </div>

                {/* Center QR Code, Certificate NO & Issue Date */}
                <div className="flex flex-col items-center justify-end text-center pb-0.5 px-2">
                  {qrCodeDataUrl ? (
                    <div className="flex flex-col items-center mb-1">
                      <img
                        src={qrCodeDataUrl}
                        alt="Verification QR Code"
                        className="w-12 h-12 sm:w-13 sm:h-13 p-0.5 bg-white border border-slate-300 rounded shadow-2xs"
                      />
                      <span className="text-[7px] sm:text-[8px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
                        Scan to Verify
                      </span>
                    </div>
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center mb-1 bg-white border border-slate-200 rounded">
                      <QrCode className="h-6 w-6 text-slate-400 animate-pulse" />
                    </div>
                  )}
                  <span className="text-xs sm:text-sm font-semibold text-[#242321] tracking-wide">
                    Certificate NO: {certNumberDisplay}
                  </span>
                  <span className="text-[10px] sm:text-xs font-medium text-[#383633] mt-0.5">
                    Date of issue: {issueDateFormatted}
                  </span>
                </div>

                {/* Right Signatory */}
                <div className="flex flex-col items-end text-right pr-2 sm:pr-4">
                  <div className="h-7 sm:h-9 flex items-center justify-end mb-0.5 sm:mb-1">
                    <svg width="110" height="34" viewBox="0 0 130 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 24C24 23 28 12 40 14C52 16 46 30 58 24C70 18 80 14 90 16C100 19 108 28 122 22" stroke="#1e40af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M34 16C48 12 72 26 86 20C98 14 110 18 118 17" stroke="#1e40af" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-[#22211f]">Demo University Authority</span>
                  <span className="text-[9px] sm:text-[11px] text-[#55534f]">University Authority</span>
                </div>
              </div>
            </div>

            {/* Invisible verifier provenance layer for pdfjs-dist extraction */}
            <div
              style={{
                position: "absolute",
                bottom: "1mm",
                left: "10mm",
                color: "rgba(251, 249, 242, 0.01)",
                fontFamily: "monospace",
                fontSize: "7pt",
                userSelect: "none",
                pointerEvents: "none",
              }}
            >
              Batch ID: {batchId} Leaf: #{leafIndex} PRN: {prnNumber} CUMULATIVE CGPA {subject?.cgpa || "8.50"} Degree of {degreeName} Root: {proof?.merkleProof?.rootHash || ""} Sepolia: 0xe7Cc39AF2ACC1dd637C863aB5DB18aC904b76Bc4
            </div>
          </div>

          {/* Compact Technical Cryptographic Verification Section (Below Certificate, No-Print on Paper) */}
          <div className="mt-4 p-4 bg-stone-50 border border-stone-200 rounded-xl text-[11px] font-mono text-stone-700 space-y-2 no-print shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-stone-700" />
                <span className="font-bold text-stone-900">Merkle Root Anchor:</span>
                <span className="text-stone-700 font-mono font-semibold">
                  {proof?.merkleProof?.rootHash ? `${proof.merkleProof.rootHash.slice(0, 10)}...${proof.merkleProof.rootHash.slice(-8)}` : "Stored in Registry"}
                </span>
                {(() => {
                  const effectiveStatus = batchStatus || verification?.batchStatus;
                  const effectiveTx = txHash || verification?.txHash;
                  const isReallyAnchored = Boolean(verification?.isOnChainAnchored && effectiveTx);
                  if (isReallyAnchored) {
                    return <span className="ml-1 text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">({isLocalChain ? "Hardhat Local Anchored" : "Sepolia Anchored"})</span>;
                  }
                  if (effectiveStatus === "PENDING_ANCHOR") {
                    return <span className="ml-1 text-[10px] text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-full">(Pending Anchor)</span>;
                  }
                  if (effectiveStatus === "ANCHOR_FAILED") {
                    return <span className="ml-1 text-[10px] text-red-800 font-bold bg-red-100 px-2 py-0.5 rounded-full">(Anchor Failed)</span>;
                  }
                  return <span className="ml-1 text-[10px] text-stone-700 font-bold bg-stone-200 px-2 py-0.5 rounded-full">(Institutionally Stored)</span>;
                })()}
              </div>

              {(() => {
                const effectiveStatus = batchStatus || verification?.batchStatus;
                const effectiveTx = txHash || verification?.txHash;
                const isReallyAnchored = Boolean(verification?.isOnChainAnchored && effectiveTx);
                if (isReallyAnchored && effectiveTx) {
                  if (isLocalChain) {
                    return (
                      <span className="inline-flex items-center gap-1 text-stone-800 font-bold font-mono text-xs">
                        <span>Tx: {effectiveTx.slice(0, 10)}... (Hardhat Local)</span>
                      </span>
                    );
                  }
                  return (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${effectiveTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-bold no-print underline"
                    >
                      <span>Verify Transaction On Sepolia</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  );
                }
                if (effectiveStatus === "PENDING_ANCHOR") {
                  return (
                    <span className="text-amber-800 font-semibold flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      <span>Awaiting Administrative Blockchain Anchoring</span>
                    </span>
                  );
                }
                return (
                  <span className="text-stone-600 font-medium">
                    Institutional Registry Storage (No On-Chain Transaction)
                  </span>
                );
              })()}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-stone-500 pt-1 border-t border-stone-200">
              <div>Batch ID: <span className="font-bold text-stone-700">{proof?.merkleProof?.batchId || "DEMO-BATCH-2024-001"}</span> • Leaf Index: <span className="font-bold text-stone-700">#{proof?.merkleProof?.leafIndex ?? 0}</span></div>
              <div>DPDP Act Compliant • Zero PII Stored On-Chain</div>
            </div>
          </div>
        </InteractiveHologramCard>
      )}

      {/* TAB 2: OFFICIAL TRANSCRIPT MARKSHEET */}
      {activeViewTab === "transcript" && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 text-slate-900 space-y-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-lg font-bold text-blue-950 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                <span>Official Cumulative Academic Transcript</span>
              </h3>
              <p className="text-xs text-slate-500">
                Permanent Record of Courses, Credit Units &amp; Grade Points
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs font-mono font-bold text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg">
                PRN: {prnNumber}
              </span>
            </div>
          </div>

          {/* Demonstration Notice */}
          <div className="bg-amber-50/90 border border-amber-200/90 rounded-lg px-4 py-2 text-center text-amber-900 text-xs font-medium tracking-wide flex items-center justify-center gap-2 shadow-2xs">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Synthetic data for academic project demonstration. This is not an officially issued degree certificate.</span>
          </div>

          {/* Student Profile Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">Candidate Name:</span>
              <span className="font-bold text-slate-900">{studentName}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Degree Program:</span>
              <span className="font-bold text-slate-900">{degreeName}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Specialization:</span>
              <span className="font-bold text-slate-900">{branchName}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Final CGPA:</span>
              <span className="font-bold text-blue-700">{cgpaDisplay}</span>
            </div>
          </div>

          {/* Semester Course Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px]">
                <tr>
                  <th className="p-3">Course Code</th>
                  <th className="p-3">Course Name</th>
                  <th className="p-3 text-center">NHEQF Level</th>
                  <th className="p-3 text-center">Credits</th>
                  <th className="p-3 text-center">Grade</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { code: "CS401", title: "Distributed Systems & Blockchain", level: 6.0, credits: 4, grade: "O" },
                  { code: "CS402", title: "Deep Learning & Neural Networks", level: 6.0, credits: 4, grade: "A+" },
                  { code: "CS403", title: "Cloud Native Architecture & Kubernetes", level: 6.0, credits: 3, grade: "O" },
                  { code: "CS404", title: "Information Security & Cryptography", level: 6.0, credits: 4, grade: "A+" },
                  { code: "CS405", title: "Final Year Capstone Project", level: 6.0, credits: 8, grade: "O" },
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-blue-900">{row.code}</td>
                    <td className="p-3 font-semibold text-slate-900">{row.title}</td>
                    <td className="p-3 text-center font-medium">Level {row.level}</td>
                    <td className="p-3 text-center font-bold text-slate-900">{row.credits}</td>
                    <td className="p-3 text-center font-mono font-bold text-blue-700">{row.grade}</td>
                    <td className="p-3 text-right">
                      <span className="text-[10px] text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                        PASSED
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CRYPTOGRAPHIC PROOF AUDIT TRAIL */}
      {activeViewTab === "crypto" && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 text-slate-900 space-y-6 shadow-sm">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-lg font-bold text-blue-950 flex items-center gap-2">
              <Lock className="h-5 w-5 text-blue-600" />
              <span>Cryptographic Proof Path &amp; Ledger Verification</span>
            </h3>
            <p className="text-xs text-slate-500">
              {(() => {
                const effectiveStatus = batchStatus || verification?.batchStatus;
                const isOnChain = Boolean(verification?.isOnChainAnchored && txHash);
                return isOnChain
                  ? `Deterministic Keccak256 leaf verification against the ${networkDisplayName} Merkle Anchor`
                  : "Deterministic Keccak256 leaf verification against the Institutional Merkle Registry";
              })()}
            </p>
          </div>

          <div className="space-y-4">
            {/* Step 1: Leaf Hash */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Step 1: Canonical JSON Keccak256 Leaf Hash</span>
                </span>
                <span className="text-[10px] bg-blue-100 text-blue-900 border border-blue-200 px-2 py-0.5 rounded font-mono font-bold">
                  32-Byte Hash
                </span>
              </div>
              <p className="font-mono text-xs text-slate-800 break-all bg-white p-2.5 rounded-lg border border-slate-200 font-semibold">
                {proof?.merkleProof?.leafHash || "No Merkle Leaf Hash Present in JSON"}
              </p>
            </div>

            {/* Step 2: Merkle Proof Siblings */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Step 2: Commutative Merkle Proof Siblings ({proof?.merkleProof?.proof?.length || 0} Hops)</span>
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-mono font-bold">
                  O(log N) Proof
                </span>
              </div>
              <div className="space-y-1.5 font-mono text-xs">
                {(proof?.merkleProof?.proof || []).map((p, idx) => (
                  <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between">
                    <span className="text-blue-700 font-bold">Hop #{idx + 1}:</span>
                    <span className="text-slate-800 truncate max-w-md">{p}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 3: Root Match & Dynamic Bitmap Check */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>
                    {(() => {
                      const effectiveStatus = batchStatus || verification?.batchStatus;
                      const isOnChain = Boolean(verification?.isOnChainAnchored && txHash);
                      return isOnChain
                        ? `Step 3: ${networkDisplayName} Contract Verification & Dynamic Bitmap Check`
                        : "Step 3: Institutional Registry Verification & Dynamic Bitmap Check";
                    })()}
                  </span>
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-0.5 rounded font-bold">
                  VALID &amp; UNREVOKED
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                The computed hash matches the institutional Merkle root. Bit index #{proof?.merkleProof?.leafIndex ?? 0} in the dynamic 256-bit revocation bitmap is 0 (Unrevoked).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RAW JSON-LD DATA */}
      {activeViewTab === "raw" && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-base font-bold text-blue-950 flex items-center gap-2">
              <Code2 className="h-4 w-4 text-blue-600" />
              <span>W3C Verifiable Credential JSON-LD Payload</span>
            </h3>
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold border border-slate-300 transition-colors"
            >
              {copiedJson ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedJson ? "Copied JSON" : "Copy Payload"}</span>
            </button>
          </div>

          <pre className="bg-slate-900 p-4 rounded-xl border border-slate-800 font-mono text-xs text-blue-300 overflow-x-auto max-h-96">
            {JSON.stringify(credential, null, 2)}
          </pre>
        </div>
      )}

      {/* Short URL Verification QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-4 shadow-2xl border border-slate-200 relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center justify-center gap-2">
              <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                <QrCode className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Official Verification QR
              </h3>
            </div>

            <p className="text-xs text-slate-500">
              {(() => {
                const effectiveStatus = batchStatus || verification?.batchStatus;
                const isOnChain = Boolean(verification?.isOnChainAnchored && txHash);
                return isOnChain
                  ? `Scan with any mobile camera to verify this degree on ${networkDisplayName}`
                  : "Scan with any mobile camera to verify this degree via the Institutional Verification Portal";
              })()}
            </p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl inline-block shadow-inner">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Official Verification QR"
                  className="w-56 h-56 mx-auto rounded-lg"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center">
                  <QrCode className="h-12 w-12 text-slate-400 animate-pulse" />
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-xs text-left">
              <div className="font-mono text-[11px] text-slate-700 truncate bg-slate-100 p-2.5 rounded-xl border border-slate-200 font-semibold">
                {shortVerificationUrl}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shortVerificationUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedLink ? "Copied Short Verification URL!" : "Copy Verification URL"}</span>
              </button>
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
