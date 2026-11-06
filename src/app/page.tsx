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
        <h1 className="text-4xl sm:text-6xl font-black text-slate-950 tracking-tight leading-tight">
          Trustless Academic Degree Verification on{" "}
          <span className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 bg-clip-text text-transparent">
            Ethereum
          </span>
        </h1>

        <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
          Cryptographically authenticate university degree diplomas with zero login and zero gas fees.
        </p>
      </div>

      {/* Central Public Verification Hub (Directly in Hero Space like Blockcerts) */}
      <div className="max-w-4xl mx-auto">
        <DropzoneVerifier />
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
              Registered University &amp; Blockchain Trust Node
            </h2>
            <p className="text-xs text-slate-500">
              Accredited university node actively issuing cryptographically verifiable degree credentials on Ethereum-compatible blockchain networks.
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
