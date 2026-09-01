"use client";

import React, { useState } from "react";
import { GitCommit, Layers, CheckCircle2, ChevronRight, Hash, Copy, Check, Cpu, ShieldCheck, ArrowUpRight } from "lucide-react";
import { StudentDegreeData } from "../types";
import { hashCredentialSubject } from "../lib/crypto";

interface MerkleTreeVisualizerProps {
  rootHash: string;
  records: StudentDegreeData[];
  proofs?: any[];
  revokedIndices?: number[];
}

export default function MerkleTreeVisualizer({
  rootHash,
  records,
  proofs,
  revokedIndices = [],
}: MerkleTreeVisualizerProps) {
  const [selectedLeafIndex, setSelectedLeafIndex] = useState<number | null>(0);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const treeDepth = Math.ceil(Math.log2(records.length || 1)) + 1;

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-2xl">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900">
              Interactive Binary Merkle Tree Architecture
            </h4>
            <p className="text-xs text-slate-500">
              32-Byte Keccak256 Cryptographic DAG &bull; O(log N) Proof Complexity
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-semibold">
            Leaves: <span className="text-blue-700 font-bold">{records.length}</span>
          </span>
          <span className="bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-semibold">
            Tree Depth: <span className="text-blue-700 font-bold">{treeDepth} Levels</span>
          </span>
        </div>
      </div>

      {/* Root Node Display (Sepolia Anchor) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900 to-blue-950 border border-blue-800 p-5 shadow-md text-white">
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-blue-200 bg-blue-800/80 border border-blue-700 px-2 py-0.5 rounded-full">
                Merkle Root (Sepolia State Commitment)
              </span>
              <span className="text-[10px] text-emerald-300 font-mono font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>O(1) Anchored</span>
              </span>
            </div>
            <div className="font-mono text-xs sm:text-sm font-bold text-white tracking-tight break-all pt-1">
              {rootHash}
            </div>
          </div>

          <button
            onClick={() => handleCopy(rootHash)}
            className="p-2 bg-blue-800 hover:bg-blue-700 text-white rounded-xl border border-blue-700 transition-colors shrink-0"
            title="Copy Root Hash"
          >
            {copiedText === rootHash ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Tree Structure Leaf Nodes */}
      <div className="space-y-3 pt-2">
        <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
          <span>Student Leaf Nodes (Click to Inspect O(log N) Cryptographic Proof Path)</span>
          {selectedLeafIndex !== null && (
            <span className="text-blue-700 text-xs font-mono font-bold">
              Inspecting Leaf #{selectedLeafIndex}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {records.map((rec, idx) => {
            const leafHash = hashCredentialSubject(rec);
            const isRevoked = revokedIndices.includes(idx);
            const isSelected = selectedLeafIndex === idx;

            return (
              <div
                key={rec.prn + idx}
                onClick={() => setSelectedLeafIndex(idx)}
                className={`p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                  isSelected
                    ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                    : isRevoked
                    ? "bg-red-50 border-red-200 hover:border-red-300"
                    : "bg-slate-50 border-slate-200 hover:border-blue-400 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                      Leaf #{idx}
                    </span>
                    <span className="text-xs font-bold text-slate-900 truncate max-w-[140px]">
                      {rec.fullName}
                    </span>
                  </div>
                  {isRevoked ? (
                    <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-800 border border-red-200 font-bold rounded-full">
                      Revoked
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-full">
                      Valid
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-600 flex items-center justify-between font-mono font-semibold">
                  <span>PRN: <span className="text-slate-900">{rec.prn}</span></span>
                  <span>CGPA: <span className="text-blue-700 font-bold">{rec.cgpa}</span></span>
                </div>

                <div className="mt-2 font-mono text-[10px] text-slate-500 bg-white p-2 rounded-lg border border-slate-200 truncate">
                  Leaf: {leafHash.slice(0, 10)}••••••••{leafHash.slice(-8)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Proof Path Detail View */}
      {selectedLeafIndex !== null && proofs && proofs[selectedLeafIndex] && (
        <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3 text-xs animate-in fade-in duration-200 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <span className="font-bold text-blue-300 flex items-center gap-1.5">
              <Cpu className="h-4 w-4 text-blue-400" />
              <span>Verification Sibling Hops for Leaf #{selectedLeafIndex} ({records[selectedLeafIndex]?.fullName})</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Path Length: {proofs[selectedLeafIndex].proof?.length || 0} Nodes
            </span>
          </div>

          <div className="space-y-2 font-mono text-xs pt-1">
            {proofs[selectedLeafIndex].proof?.map((p: string, pIdx: number) => (
              <div
                key={pIdx}
                className="flex items-center justify-between bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-slate-300"
              >
                <span className="text-blue-400 font-semibold">Sibling Hash #{pIdx + 1}:</span>
                <span className="truncate max-w-md text-white font-medium">{p.slice(0, 12)}••••••••{p.slice(-8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
