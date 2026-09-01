"use client";

import React, { useState } from "react";
import { GitCommit, Layers, CheckCircle2, ChevronRight, Hash, Copy, Check } from "lucide-react";
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
  const [selectedLeafIndex, setSelectedLeafIndex] = useState<number | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 text-blue-900 rounded-lg">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Interactive Merkle Tree Visualization
            </h4>
            <p className="text-[11px] text-slate-500">
              Binary Tree &bull; 32-Byte Keccak256 Leaf & Root Nodes
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-600 font-mono bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
          Total Leaves: <span className="font-bold text-slate-900">{records.length}</span>
        </div>
      </div>

      {/* Root Node Display */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl p-4 shadow-sm relative overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-blue-300 block mb-1">
              Merkle Root (Sepolia Anchor)
            </span>
            <div className="font-mono text-xs sm:text-sm font-bold tracking-tight break-all">
              {rootHash}
            </div>
          </div>
          <button
            onClick={() => handleCopy(rootHash)}
            className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors shrink-0"
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

      {/* Tree Structure Nodes */}
      <div className="space-y-3 pt-2">
        <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
          <span>Student Leaf Nodes (Click to Inspect Cryptographic Proof Path)</span>
          {selectedLeafIndex !== null && (
            <button
              onClick={() => setSelectedLeafIndex(null)}
              className="text-blue-700 hover:underline text-[11px]"
            >
              Clear Selection
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {records.map((rec, idx) => {
            const leafHash = hashCredentialSubject(rec);
            const isRevoked = revokedIndices.includes(idx);
            const isSelected = selectedLeafIndex === idx;

            return (
              <div
                key={rec.prn + idx}
                onClick={() => setSelectedLeafIndex(idx)}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  isSelected
                    ? "bg-blue-50 border-blue-600 ring-2 ring-blue-500/20 shadow-xs"
                    : isRevoked
                    ? "bg-red-50/50 border-red-200 hover:border-red-300"
                    : "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold text-slate-700">
                      Leaf #{idx}
                    </span>
                    <span className="text-xs font-semibold text-slate-900 truncate max-w-[140px]">
                      {rec.fullName}
                    </span>
                  </div>
                  {isRevoked ? (
                    <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 font-semibold rounded">
                      Revoked
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded">
                      Valid
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>PRN: {rec.prn}</span>
                  <span>CGPA: {rec.cgpa}</span>
                </div>

                <div className="mt-1.5 font-mono text-[10px] text-slate-600 bg-white px-2 py-1 rounded border border-slate-200 truncate">
                  {leafHash}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Proof Path Detail View */}
      {selectedLeafIndex !== null && proofs && proofs[selectedLeafIndex] && (
        <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2 mt-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-blue-300">
              Cryptographic Proof Path for Leaf #{selectedLeafIndex} ({records[selectedLeafIndex]?.fullName})
            </span>
            <span className="text-[11px] text-slate-400">
              Proof Length: {proofs[selectedLeafIndex].proof?.length || 0}
            </span>
          </div>

          <div className="space-y-1 font-mono text-[11px] pt-1">
            {proofs[selectedLeafIndex].proof?.map((p: string, pIdx: number) => (
              <div
                key={pIdx}
                className="flex items-center gap-2 bg-slate-800/80 px-2.5 py-1 rounded text-slate-300"
              >
                <span className="text-blue-400">Sibling #{pIdx + 1}:</span>
                <span className="truncate">{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
