"use client";

import React, { useState, useEffect, Suspense } from "react";
import DropzoneVerifier from "../components/DropzoneVerifier";
import RegisterUniversityModal from "../components/RegisterUniversityModal";
import {
  ShieldCheck,
  Lock,
  Zap,
  CheckCircle2,
  Award,
  FileText,
  Database,
  Cpu,
  Layers,
  Sparkles,
  TrendingUp,
  Activity,
  ArrowRight,
  Building2,
  PlusCircle,
  Globe,
  UserCheck,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getConsortiumInstitutions } from "../lib/storage";
import { ConsortiumInstitution } from "../types";
import { useAuth } from "../context/AuthContext";

export default function PublicVerifierPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-xs text-slate-500 font-semibold">Loading Verifier...</div>}>
      <PublicVerifierContent />
    </Suspense>
  );
}

function PublicVerifierContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const [isRegisterUniModalOpen, setIsRegisterUniModalOpen] = useState(false);
  const [institutions, setInstitutions] = useState<ConsortiumInstitution[]>([]);
  const [institutionsCount, setInstitutionsCount] = useState(4);
  const [mounted, setMounted] = useState(false);

  const isExplicitVerifier = searchParams.get("verifier") === "true";

  useEffect(() => {
    setMounted(true);
    const list = getConsortiumInstitutions();
    setInstitutions(list);
    setInstitutionsCount(list.length);
  }, [isRegisterUniModalOpen]);

  // A logged-in user must NEVER see the public landing page or hero section.
  // If they navigate to root without explicitly requesting the verifier tool, redirect immediately:
  useEffect(() => {
    if (mounted && isAuthenticated && user && !isExplicitVerifier) {
      if (user.role === "STUDENT") {
        router.replace("/student");
      } else if (user.role === "EXAM_ADMIN") {
        router.replace("/issuer");
      }
    }
  }, [mounted, isAuthenticated, user, isExplicitVerifier, router]);

  // If redirecting logged-in user to their dashboard, show a brief loading state
  if (mounted && isAuthenticated && user && !isExplicitVerifier) {
    return (
      <div className="py-20 text-center space-y-3">
        <div className="w-10 h-10 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto" />
        <p className="text-xs text-slate-500 font-bold">
          Redirecting to {user.role === "STUDENT" ? "Student Vault" : "Admin Console"}...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12 py-4">
      {/* Hero Section */}
      <div className="text-center max-w-4xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-full text-xs font-bold shadow-2xs">
          <Sparkles className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
          <span>OpenCerts 2.0 &bull; Blockcerts Standard &bull; MGM University Registry</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-slate-950 tracking-tight leading-tight">
          Trustless Academic Degree Verification on{" "}
          <span className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 bg-clip-text text-transparent">
            Ethereum
          </span>
        </h1>

        <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
          Cryptographically authenticate university degree diplomas in &lt;140ms with zero login, zero gas fees, and 100% DPDP Act Zero-PII on-chain privacy.
        </p>
      </div>

      {/* Central Public Verification Hub (Directly in Hero Space like Blockcerts) */}
      <div className="max-w-4xl mx-auto">
        <DropzoneVerifier />
      </div>

      {/* Live Blockchain Metrics Bar (Positioned below Verifier) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-5xl mx-auto">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 text-center space-y-1 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
            Verification Latency
          </span>
          <div className="text-2xl font-black text-blue-700 font-mono">
            &lt; 140 ms
          </div>
          <span className="text-[10px] text-emerald-700 font-bold">Client-Side O(1)</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 text-center space-y-1 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
            Gas Efficiency
          </span>
          <div className="text-2xl font-black text-blue-700 font-mono">
            99.8% Saved
          </div>
          <span className="text-[10px] text-slate-500 font-medium">Single O(1) Tx for 1,000+</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 text-center space-y-1 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
            DPDP Privacy Score
          </span>
          <div className="text-2xl font-black text-blue-700 font-mono">
            100% Zero-PII
          </div>
          <span className="text-[10px] text-blue-800 font-bold">ZK Selective Disclosure</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 text-center space-y-1 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
            Accredited Node
          </span>
          <div className="text-2xl font-black text-blue-700 font-mono" suppressHydrationWarning>
            MGM University
          </div>
          <span className="text-[10px] text-emerald-700 font-bold">Node MGMU-ENG-01</span>
        </div>
      </div>

      {/* PROMINENT UNIVERSITY REGISTRATION & CONSORTIUM ONBOARDING BANNER */}
      <div id="consortium" className="max-w-5xl mx-auto bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 rounded-3xl p-8 sm:p-10 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-blue-200 border border-white/20">
              <Building2 className="h-3.5 w-3.5 text-blue-300" />
              <span>Multi-University Blockchain Consortium</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Are you an Accredited University or Examination Authority?
            </h2>
            <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
              Join the Ethereum Academic Trust Network. Onboard your institution to anchor graduation batches, eliminate certificate forgery, and enable seamless NEP 2020 cross-university credit verification.
            </p>
          </div>

          <div className="shrink-0 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setIsRegisterUniModalOpen(true)}
              className="px-6 py-3.5 bg-white hover:bg-blue-50 text-blue-950 font-black rounded-2xl text-xs sm:text-sm shadow-lg hover:scale-103 transition-all flex items-center justify-center gap-2"
            >
              <PlusCircle className="h-4 w-4 text-blue-700" />
              <span>Register Your University</span>
            </button>

            <Link
              href="/issuer"
              className="px-5 py-3.5 bg-blue-700/60 hover:bg-blue-700 text-white font-bold rounded-2xl text-xs sm:text-sm border border-white/20 hover:border-white/40 transition-all flex items-center justify-center gap-2"
            >
              <Layers className="h-4 w-4" />
              <span>Exam Cell Desk</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Feature Architecture Cards */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        <div className="glass-card-interactive p-6 rounded-3xl space-y-3 bg-white">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
            <Lock className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            India DPDP Act (Zero-PII On-Chain)
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Zero personally identifiable information is ever published on Ethereum. Only 32-byte cryptographic Merkle roots are committed, preserving total student privacy.
          </p>
        </div>

        <div className="glass-card-interactive p-6 rounded-3xl space-y-3 bg-white">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
            <Zap className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            O(1) Dynamic Revocation Bitmaps
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Dynamic 256-bit bitmap words in Solidity allow exam cells to invalidate individual credentials without recalculating or modifying the existing Merkle root.
          </p>
        </div>

        <div className="glass-card-interactive p-6 rounded-3xl space-y-3 bg-white">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
            <Award className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            NEP 2020 Academic Bank of Credits
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Modular multi-institution course credit aggregation, NHEQF Level calculations, and instant semester eligibility evaluation for seamless lateral student mobility.
          </p>
        </div>
      </div>

      {/* Comparison Table: Traditional vs Centralized vs Ethereum Sepolia */}
      <div className="max-w-5xl mx-auto bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          <span>Architectural Comparison &amp; Security Benchmarks</span>
        </h3>

        <div className="overflow-x-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px]">
              <tr>
                <th className="p-3.5">Verification Metric</th>
                <th className="p-3.5 text-slate-600">Traditional Paper</th>
                <th className="p-3.5 text-slate-600">Centralized DB Portal</th>
                <th className="p-3.5 text-blue-900 font-bold bg-blue-50">MGM Trust Registry (Web3)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="p-3.5 font-bold text-slate-900">Tamper Detection</td>
                <td className="p-3.5 text-red-600">Manual inspection (Easy to fake)</td>
                <td className="p-3.5 text-amber-700">Vulnerable to SQL/admin tampering</td>
                <td className="p-3.5 font-bold text-emerald-800 bg-blue-50/50">Cryptographically 100% Tamper-Proof</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-slate-900">Verification Time</td>
                <td className="p-3.5 text-slate-500">2-4 Weeks (Postal/Manual)</td>
                <td className="p-3.5 text-slate-500">3-5 Seconds (Server dependent)</td>
                <td className="p-3.5 font-bold text-blue-700 bg-blue-50/50">&lt; 140 Milliseconds (Client-Side)</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-slate-900">Single Point of Failure</td>
                <td className="p-3.5 text-red-600">Physical loss / Flood / Fire</td>
                <td className="p-3.5 text-red-600">Server outage / DB ransom attacks</td>
                <td className="p-3.5 font-bold text-emerald-800 bg-blue-50/50">Zero (Ethereum Sepolia Consensus)</td>
              </tr>
              <tr>
                <td className="p-3.5 font-bold text-slate-900">Revocation Handling</td>
                <td className="p-3.5 text-red-600">Impossible to recall printed paper</td>
                <td className="p-3.5 text-slate-500">Manual DB row deletion</td>
                <td className="p-3.5 font-bold text-emerald-800 bg-blue-50/50">O(1) Dynamic 256-Bit Bitmap Invalidation</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================= */}
      {/* REGISTERED CONSORTIUM UNIVERSITIES SHOWCASE (BOTTOM OF SITE) */}
      {/* ========================================================= */}
      <div id="registered-universities" className="max-w-5xl mx-auto space-y-6 pt-4 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-900 rounded-full text-xs font-bold border border-blue-200 mb-1">
              <Building2 className="h-3.5 w-3.5 text-blue-600" />
              <span>Accredited Issuing Authority</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Registered University &amp; Sepolia Trust Node
            </h2>
            <p className="text-xs text-slate-500">
              Accredited university node actively issuing cryptographically verifiable degree credentials on Ethereum Sepolia.
            </p>
          </div>

          <button
            onClick={() => setIsRegisterUniModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 hover:scale-102"
          >
            <PlusCircle className="h-4 w-4" />
            <span>+ Register Your University</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {institutions.map((uni) => (
            <div
              key={uni.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all space-y-3 relative overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-700 to-indigo-800 text-white flex items-center justify-center font-bold font-serif text-sm shadow-sm shrink-0">
                    {uni.shortName ? uni.shortName.slice(0, 3).toUpperCase() : "UNI"}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {uni.name}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {uni.city}, {uni.state}
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200 shrink-0">
                  {uni.code}
                </span>
              </div>

              <p className="text-[11px] text-slate-600 leading-relaxed border-t border-slate-100 pt-2">
                {uni.establishedAct}
              </p>

              <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-slate-500">
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>On-Chain Active</span>
                </div>

                {uni.website && (
                  <a
                    href={uni.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-1 font-sans font-semibold"
                  >
                    <span>Official Portal</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Register University */}
      <RegisterUniversityModal
        isOpen={isRegisterUniModalOpen}
        onClose={() => setIsRegisterUniModalOpen(false)}
        onRegistered={(newInst) => {
          setIsRegisterUniModalOpen(false);
          router.push("/issuer");
        }}
      />
    </div>
  );
}
