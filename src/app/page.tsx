"use client";

import React from "react";
import DropzoneVerifier from "../components/DropzoneVerifier";
import { ShieldCheck, Lock, Zap, CheckCircle2, Award, FileText, Database } from "lucide-react";

export default function PublicVerifierPage() {
  return (
    <div className="space-y-10 py-2">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100/70 border border-blue-200 text-blue-900 rounded-full text-xs font-semibold">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
          <span>OpenCerts / Blockcerts Minimalist Verifier</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
          Verify Academic Degrees on Ethereum Sepolia
        </h1>

        <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
          Zero login, zero gas fees. Cryptographically validates degree authenticity, tamper-resistance, and dynamic revocation status in milliseconds.
        </p>
      </div>

      {/* Main Drag-and-Drop Verifier Card */}
      <div className="max-w-4xl mx-auto">
        <DropzoneVerifier />
      </div>

      {/* Key Architectural Guarantees */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-200">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center">
            <Lock className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            India DPDP Act (Zero-PII On-Chain)
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            No personally identifiable information is ever stored on the public blockchain. Only 32-byte cryptographic Merkle roots are anchored.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-900 flex items-center justify-center">
            <Zap className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            O(1) Dynamic Revocation Bitmaps
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Revoking degrees does not require recomputing Merkle trees. Dynamic 256-bit bitmap words invalidate individual degrees instantaneously.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-900 flex items-center justify-center">
            <Award className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            EIP-712 PRN Identity Binding
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Permanent Registration Numbers (PRNs) are cryptographically bound to student Web3 wallets using typed signatures.
          </p>
        </div>
      </div>
    </div>
  );
}
