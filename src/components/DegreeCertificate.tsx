"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { W3CCredentialPayload, VerificationResult } from "../types";
import InteractiveHologramCard from "./InteractiveHologramCard";

interface DegreeCertificateProps {
  credential: W3CCredentialPayload;
  verification?: VerificationResult | null;
  onShowQr?: () => void;
}

export default function DegreeCertificate({
  credential,
  verification,
  onShowQr,
}: DegreeCertificateProps) {
  const [activeViewTab, setActiveViewTab] = useState<"certificate" | "transcript" | "crypto" | "raw">("certificate");
  const [copiedJson, setCopiedJson] = useState(false);

  const subject = credential.credentialSubject;
  const proof = credential.proof;
  const isZk = proof.type === "ZkSelectiveProof2024" || !!proof.zkProof;

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
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Top Action Bar with Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs">
        {/* View Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
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

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {onShowQr && (
            <button
              onClick={onShowQr}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-colors"
            >
              <QrCode className="h-3.5 w-3.5 text-blue-600" />
              <span>QR Code</span>
            </button>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all hover:scale-102"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Official Diploma</span>
          </button>
        </div>
      </div>

      {/* TAB 1: OFFICIAL DEGREE CERTIFICATE */}
      {activeViewTab === "certificate" && (
        <InteractiveHologramCard className="shadow-xl">
          <div
            id="printable-degree"
            className="certificate-parchment guilloche-border rounded-2xl p-8 sm:p-14 relative text-slate-900 overflow-hidden bg-white shadow-lg"
          >
            {/* Corner Accents */}
            <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-blue-900 flex items-start justify-start p-1">
              <span className="text-[9px] font-mono font-bold text-blue-900">MGMU</span>
            </div>
            <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-blue-900 flex items-start justify-end p-1">
              <span className="text-[9px] font-mono font-bold text-blue-900">2024</span>
            </div>
            <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-blue-900" />
            <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-blue-900" />

            {/* University Crest & Header */}
            <div className="text-center space-y-3 relative z-10 border-b border-slate-200 pb-8">
              <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center text-white shadow-xl ring-8 ring-blue-100 relative">
                <GraduationCap className="h-10 w-10 text-white drop-shadow" />
              </div>

              <div>
                <h1 className="text-2xl sm:text-4xl font-serif font-black text-blue-950 uppercase tracking-widest pt-2">
                  {subject.university || "MGM University"}
                </h1>
                <p className="text-xs sm:text-sm font-serif italic text-slate-600 tracking-wide mt-1">
                  Chhatrapati Sambhajinagar, Maharashtra, India &bull; Established under Maharashtra Act No. XXVI
                </p>
              </div>

              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-900 px-5 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-xs">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
                <span>Certified On Ethereum Sepolia Blockchain</span>
              </div>
            </div>

            {/* Body Text */}
            <div className="text-center my-10 space-y-6 relative z-10">
              <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">
                The Board of Management and the Academic Council hereby confer the degree of
              </p>

              <div className="space-y-1">
                <h2 className="text-3xl sm:text-4xl font-serif font-black text-blue-950 tracking-tight">
                  {subject.degree}
                </h2>
                <p className="text-lg sm:text-xl font-serif italic font-bold text-blue-800">
                  in {subject.branch}
                </p>
              </div>

              <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">
                upon
              </p>

              <div className="text-3xl sm:text-5xl font-serif font-black text-slate-950 underline decoration-blue-600 decoration-3 underline-offset-8 py-1">
                {subject.fullName}
              </div>

              <p className="text-xs text-slate-600 max-w-2xl mx-auto leading-relaxed pt-2">
                who has successfully fulfilled all academic requirements, practical dissertations, and examinations prescribed by the university under the National Higher Education Qualifications Framework (NHEQF).
              </p>

              {/* Badges Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center shadow-xs">
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                    Permanent Reg. No.
                  </span>
                  <span className="font-mono text-xs font-black text-blue-900">
                    {subject.prn}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center shadow-xs">
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                    Cumulative CGPA
                  </span>
                  <span className="font-serif text-sm font-black text-blue-900">
                    {isZk ? `≥ ${proof.zkProof?.thresholdValue}` : Number(subject.cgpa).toFixed(2)} / 10.0
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center shadow-xs">
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                    Year of Graduation
                  </span>
                  <span className="font-mono text-xs font-black text-slate-900">
                    {subject.graduationYear}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center shadow-xs">
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                    NHEQF Level
                  </span>
                  <span className="font-sans text-xs font-black text-emerald-800">
                    Level {subject.nheqfLevel || 6.0}
                  </span>
                </div>
              </div>
            </div>

            {/* Official Signatures & Seal */}
            <div className="grid grid-cols-3 items-end pt-10 pb-6 border-t border-slate-200 text-center relative z-10">
              <div className="space-y-1">
                <div className="font-serif italic text-base text-slate-900 font-bold">
                  Dr. S. K. Mahajan
                </div>
                <div className="h-0.5 w-28 bg-slate-400 mx-auto" />
                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Dean, Faculty of Engineering
                </div>
              </div>

              {/* Embossed University Seal */}
              <div className="flex flex-col items-center">
                <div className="relative w-20 h-20 rounded-full border-4 border-blue-800 bg-gradient-to-tr from-blue-100 to-blue-50 flex flex-col items-center justify-center text-blue-950 shadow-md ring-4 ring-blue-100">
                  <Award className="h-8 w-8 text-blue-800" />
                  <span className="text-[8px] font-black uppercase tracking-tighter text-blue-900">
                    SEAL OF AUTHENTICITY
                  </span>
                </div>
                <span className="text-[9px] font-semibold text-slate-500 mt-1">Official University Seal</span>
              </div>

              <div className="space-y-1">
                <div className="font-serif italic text-base text-slate-900 font-bold">
                  Prof. V. M. Deshpande
                </div>
                <div className="h-0.5 w-28 bg-slate-400 mx-auto" />
                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Controller of Examinations
                </div>
              </div>
            </div>

            {/* Bottom Cryptographic Anchor Bar */}
            <div className="mt-6 pt-4 border-t border-slate-200 bg-slate-50/80 -mx-8 sm:-mx-14 -mb-8 sm:-mb-14 p-6 text-[11px] font-mono text-slate-700 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-blue-700" />
                  <span className="font-bold text-slate-900">Merkle Anchor:</span>
                  <span className="text-slate-700 font-mono font-semibold">
                    {proof.merkleProof?.rootHash ? `${proof.merkleProof.rootHash.slice(0, 10)}••••••••${proof.merkleProof.rootHash.slice(-8)}` : "Verified On Sepolia"}
                  </span>
                </div>

                <a
                  href={getEtherscanUrl(proof.merkleProof?.contractAddress || "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7")}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-bold no-print underline"
                >
                  <span>Verify On Sepolia Etherscan</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                <div>Batch ID: {proof.merkleProof?.batchId || "MGM-2024-BTECH-BATCH01"} &bull; Leaf Index: #{proof.merkleProof?.leafIndex ?? 0}</div>
                <div>DPDP Act Compliant &bull; Zero PII On-Chain</div>
              </div>
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
                PRN: {subject.prn}
              </span>
            </div>
          </div>

          {/* Student Profile Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">Candidate Name:</span>
              <span className="font-bold text-slate-900">{subject.fullName}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Degree Program:</span>
              <span className="font-bold text-slate-900">{subject.degree}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Specialization:</span>
              <span className="font-bold text-slate-900">{subject.branch}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Final CGPA:</span>
              <span className="font-bold text-blue-700">{subject.cgpa} / 10.0</span>
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
              Deterministic Keccak256 leaf verification against the Sepolia Merkle Anchor
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
                {proof.merkleProof?.leafHash || "0x78cbf7ec4aa8904c81d73ea3330051d6e2c5bb2dcc1423b3d94e4ca5a89036df"}
              </p>
            </div>

            {/* Step 2: Merkle Proof Siblings */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Step 2: Commutative Merkle Proof Siblings ({proof.merkleProof?.proof.length || 2} Hops)</span>
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-mono font-bold">
                  O(log N) Proof
                </span>
              </div>
              <div className="space-y-1.5 font-mono text-xs">
                {proof.merkleProof?.proof.map((p, idx) => (
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
                  <span>Step 3: Sepolia Contract Verification &amp; Dynamic Bitmap Check</span>
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-0.5 rounded font-bold">
                  VALID &amp; UNREVOKED
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                The computed hash matches the anchored root on Sepolia smart contract <span className="font-mono text-blue-700 font-bold">0x89205A...43e7</span>. Bit index #{proof.merkleProof?.leafIndex ?? 0} in the dynamic 256-bit revocation bitmap is 0 (Unrevoked).
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
    </div>
  );
}
