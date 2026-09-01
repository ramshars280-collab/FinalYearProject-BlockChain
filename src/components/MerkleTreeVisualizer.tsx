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
    <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-2xl">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-white">
              Interactive Binary Merkle Tree Architecture
            </h4>
            <p className="text-xs text-slate-400">
              32-Byte Keccak256 Cryptographic DAG &bull; O(log N) Proof Complexity
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="bg-slate-900 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-xl">
            Leaves: <span className="text-cyan-400 font-bold">{records.length}</span>
          </span>
          <span className="bg-slate-900 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-xl">
            Tree Depth: <span className="text-emerald-400 font-bold">{treeDepth} Levels</span>
          </span>
        </div>
      </div>

      {/* Root Node Display (Sepolia Anchor) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950/90 via-indigo-950/80 to-slate-950 border border-cyan-500/40 p-5 shadow-xl">
        <div className="absolute top-0 right-0 h-full w-48 bg-gradient-to-l from-cyan-500/10 to-transparent pointer-events-none" />

        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-300 bg-cyan-950/80 border border-cyan-800 px-2 py-0.5 rounded-full">
                Merkle Root (Sepolia State Commitment)
              </span>
              <span className="text-[10px] text-emerald-400 font-mono font-semibold flex items-center gap-1">
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
            className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors shrink-0"
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
        <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
          <span>Student Leaf Nodes (Click to Inspect O(log N) Cryptographic Proof Path)</span>
          {selectedLeafIndex !== null && (
            <span className="text-cyan-400 text-xs font-mono font-bold">
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
                    ? "bg-blue-950/70 border-cyan-400 ring-2 ring-cyan-500/30 shadow-lg shadow-cyan-500/10 scale-[1.01]"
                    : isRevoked
                    ? "bg-red-950/30 border-red-800/60 hover:border-red-700"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/90"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                      Leaf #{idx}
                    </span>
                    <span className="text-xs font-bold text-white truncate max-w-[140px]">
                      {rec.fullName}
                    </span>
                  </div>
                  {isRevoked ? (
                    <span className="text-[10px] px-2 py-0.5 bg-red-950 text-red-300 border border-red-800 font-bold rounded-full">
                      Revoked
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold rounded-full">
                      Valid
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
                  <span>PRN: <span className="text-slate-200">{rec.prn}</span></span>
                  <span>CGPA: <span className="text-cyan-400 font-bold">{rec.cgpa}</span></span>
                </div>

                <div className="mt-2 font-mono text-[10px] text-slate-400 bg-slate-950 p-2 rounded-lg border border-slate-800/80 truncate">
                  {leafHash}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Proof Path Detail View */}
      {selectedLeafIndex !== null && proofs && proofs[selectedLeafIndex] && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <span className="font-bold text-cyan-300 flex items-center gap-1.5">
              <Cpu className="h-4 w-4 text-cyan-400" />
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
                className="flex items-center justify-between bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 text-slate-300"
              >
                <span className="text-cyan-400 font-semibold">Sibling Hash #{pIdx + 1}:</span>
                <span className="truncate max-w-md text-slate-200">{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
