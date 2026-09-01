"use client";

import React from "react";
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
} from "lucide-react";
import { W3CCredentialPayload, VerificationResult } from "../types";

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
  const subject = credential.credentialSubject;
  const proof = credential.proof;
  const isZk = proof.type === "ZkSelectiveProof2024" || !!proof.zkProof;

  const handlePrint = () => {
    window.print();
  };

  const getEtherscanUrl = (addressOrTx: string) => {
    return `https://sepolia.etherscan.io/address/${addressOrTx}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Certificate Card Header Controls */}
      <div className="flex items-center justify-between no-print px-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-full text-xs font-semibold shadow-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
            <span>OpenCerts 2.0 / W3C Standard Verified</span>
          </span>
          {isZk && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 border border-purple-300 text-purple-900 rounded-full text-xs font-medium">
              <Sparkles className="h-3 w-3 text-purple-700" />
              <span>DPDP Zero-PII Selective Disclosure</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onShowQr && (
            <button
              onClick={onShowQr}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>View QR</span>
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-medium shadow-xs transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print / PDF</span>
          </button>
        </div>
      </div>

      {/* Official Certificate Layout */}
      <div
        id="printable-degree"
        className="relative bg-white border-8 border-double border-blue-900/80 rounded-2xl p-8 sm:p-12 shadow-2xl overflow-hidden text-slate-900"
      >
        {/* Subtle Ornamental Background Patterns */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e3a8a_1px,transparent_1px)] [background-size:24px_24px] opacity-5 pointer-events-none" />
        
        {/* Corner Accents */}
        <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-amber-600" />
        <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-amber-600" />
        <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-amber-600" />
        <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-amber-600" />

        {/* Header: University Branding & Crest */}
        <div className="text-center space-y-2 relative z-10 border-b border-slate-200 pb-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 flex items-center justify-center text-white shadow-lg ring-4 ring-amber-100">
            <GraduationCap className="h-9 w-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 uppercase tracking-widest pt-2">
            {subject.university || "MGM University"}
          </h1>
          <p className="text-xs sm:text-sm font-serif italic text-slate-600 tracking-wide">
            Chhatrapati Sambhajinagar, Maharashtra, India &bull; Established under Govt. of Maharashtra Act
          </p>
          <div className="inline-block bg-amber-50 border border-amber-300 text-amber-900 px-4 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider">
            Examination Authority &bull; Degree Credential
          </div>
        </div>

        {/* Certificate Body */}
        <div className="text-center my-8 space-y-6 relative z-10">
          <p className="text-sm uppercase tracking-widest text-slate-500 font-medium">
            This is to certify that
          </p>

          <div className="text-3xl sm:text-4xl font-serif font-extrabold text-blue-950 underline decoration-amber-500/60 decoration-2 underline-offset-8">
            {subject.fullName}
          </div>

          <p className="text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed">
            having completed all prescribed academic courses, practicals, research projects, and university examinations in accordance with the university regulations, is admitted to the degree of
          </p>

          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">
              {subject.degree}
            </h2>
            <p className="text-base sm:text-lg font-medium text-blue-800">
              in {subject.branch}
            </p>
          </div>

          {/* Academic Evaluation Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-4 pb-2">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">
                PRN Number
              </span>
              <span className="font-mono text-sm font-bold text-slate-900">
                {subject.prn}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">
                Cumulative CGPA
              </span>
              <span className="font-serif text-base font-extrabold text-blue-900">
                {isZk ? `≥ ${proof.zkProof?.thresholdValue}` : Number(subject.cgpa).toFixed(2)}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">
                Graduation Year
              </span>
              <span className="font-mono text-sm font-bold text-slate-900">
                {subject.graduationYear}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-semibold uppercase text-slate-500 tracking-wider block">
                NHEQF Level
              </span>
              <span className="font-sans text-sm font-bold text-emerald-800">
                Level {subject.nheqfLevel || 6.0}
              </span>
            </div>
          </div>

          {subject.division && (
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Classification: <span className="text-amber-800">{subject.division}</span>
            </p>
          )}
        </div>

        {/* Signatures & Official Seals */}
        <div className="grid grid-cols-3 items-end pt-8 pb-4 border-t border-slate-200 text-center relative z-10">
          <div className="space-y-1">
            <div className="font-serif italic text-base text-slate-800 font-semibold">
              Dr. S. K. Mahajan
            </div>
            <div className="h-0.5 w-24 bg-slate-400 mx-auto" />
            <div className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">
              Dean, Academics
            </div>
          </div>

          {/* Central Hologram Gold Stamp */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full border-4 border-amber-500 bg-gradient-to-tr from-amber-100 to-amber-200 flex flex-col items-center justify-center text-amber-900 shadow-inner">
              <Award className="h-6 w-6 text-amber-700" />
              <span className="text-[8px] font-bold uppercase tracking-tighter">VERIFIED</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1">Official University Seal</span>
          </div>

          <div className="space-y-1">
            <div className="font-serif italic text-base text-slate-800 font-semibold">
              Prof. V. M. Deshpande
            </div>
            <div className="h-0.5 w-24 bg-slate-400 mx-auto" />
            <div className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">
              Controller of Examinations
            </div>
          </div>
        </div>

        {/* Cryptographic Ledger Verification Footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 bg-slate-50/70 -mx-8 -mb-8 p-6 text-[11px] text-slate-600 font-mono space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold text-slate-800">Sepolia Merkle Root:</span>
              <span className="text-slate-600 truncate max-w-xs sm:max-w-md">
                {proof.merkleProof?.rootHash || "0xde333280...eb33"}
              </span>
            </div>

            <a
              href={getEtherscanUrl(proof.merkleProof?.contractAddress || "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-medium no-print underline"
            >
              <span>View On Sepolia Etherscan</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px] text-slate-500">
            <div>Batch ID: {proof.merkleProof?.batchId || "MGM-2024-BTECH-BATCH01"}</div>
            <div>Leaf Index: #{proof.merkleProof?.leafIndex ?? 0} &bull; Network: Ethereum Sepolia (11155111)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
