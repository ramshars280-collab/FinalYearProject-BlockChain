"use client";

import React, { useState } from "react";
import { X, AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { BatchRecord } from "../types";
import { revokeCredentialOnChain } from "../lib/contracts";
import { saveRevocationRecord, RevocationReasonCode } from "../lib/storage";

interface BatchRevocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: BatchRecord;
  onRevokedSuccess: () => void;
}

export default function BatchRevocationModal({
  isOpen,
  onClose,
  batch,
  onRevokedSuccess,
}: BatchRevocationModalProps) {
  const [selectedLeafIndex, setSelectedLeafIndex] = useState<number>(0);
  const [reasonCode, setReasonCode] = useState<RevocationReasonCode>("CLERICAL_CORRECTION");
  const [reasonDescription, setReasonDescription] = useState<string>(
    "Clerical recalculation of academic credits/CGPA following re-evaluation."
  );
  const [supersededByHash, setSupersededByHash] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successTx, setSuccessTx] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);

  if (!isOpen) return null;

  const handleRevoke = async () => {
    setIsSubmitting(true);
    try {
      let signer = null;
      if (typeof window !== "undefined" && (window as any).ethereum) {
        const { ethers } = await import("ethers");
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        signer = await provider.getSigner().catch(() => null);
      }

      const res = await revokeCredentialOnChain(batch.batchId, selectedLeafIndex, signer);
      setIsSimulated(res.simulated);

      const reasonTitleMap: Record<RevocationReasonCode, string> = {
        CLERICAL_CORRECTION: "Clerical Correction / CGPA Recalculation",
        NAME_REVISION: "Surname or Candidate Name Spelling Revision",
        ADMIN_REISSUE: "Administrative Re-issue / Specialization Change",
        MALPRACTICE_DISCIPLINARY: "Disciplinary Malpractice / Official Cancellation",
      };

      saveRevocationRecord({
        batchId: batch.batchId,
        leafIndex: selectedLeafIndex,
        reasonCode,
        reasonTitle: reasonTitleMap[reasonCode],
        reasonDescription: reasonDescription || "Official administrative revocation recorded on Sepolia registry.",
        supersededByHash: supersededByHash.trim() || undefined,
        revokedAt: new Date().toISOString().slice(0, 10),
        officerStaffId: "COE-EXAM-DESK",
      });

      // Synchronize revocation with server database
      try {
        await fetch("/api/batches/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchId: batch.batchId,
            leafIndex: selectedLeafIndex,
            reasonCode,
            reasonTitle: reasonTitleMap[reasonCode],
            reasonDescription: reasonDescription || "Official administrative revocation recorded on Sepolia registry.",
            supersededByHash: supersededByHash.trim() || undefined,
            officerStaffId: "COE-EXAM-DESK",
          }),
        });
      } catch (syncErr) {
        console.error("Failed to synchronize revocation with server database:", syncErr);
      }

      setSuccessTx(res.txHash);
      onRevokedSuccess();
    } catch (e) {
      console.error("Revocation failed:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2.5 bg-amber-100 text-amber-900 rounded-xl">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Revoke Academic Credential
            </h3>
            <p className="text-xs text-slate-500">
              Dynamic O(1) 256-bit Bitmap Invalidation
            </p>
          </div>
        </div>

        {!successTx ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Revoking a credential marks it invalid permanently on Sepolia without requiring any tree recalculation or touching other student degrees.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Select Student / Leaf to Revoke:
              </label>
              <select
                value={selectedLeafIndex}
                onChange={(e) => setSelectedLeafIndex(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                {batch.records.map((rec, idx) => {
                  const isRev = batch.revokedIndices.includes(idx);
                  return (
                    <option key={idx} value={idx} disabled={isRev}>
                      Leaf #{idx}: {rec.fullName} ({rec.prn}) {isRev ? "[ALREADY REVOKED]" : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Official Revocation Reason:
              </label>
              <select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value as RevocationReasonCode)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                <option value="CLERICAL_CORRECTION">Clerical Error / CGPA Recalculation</option>
                <option value="NAME_REVISION">Candidate Name / Surname Spelling Revision</option>
                <option value="ADMIN_REISSUE">Administrative Re-issue / Specialization Change</option>
                <option value="MALPRACTICE_DISCIPLINARY">Disciplinary Action / Malpractice Cancellation</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Audit Notes / Justification:
              </label>
              <input
                type="text"
                value={reasonDescription}
                onChange={(e) => setReasonDescription(e.target.value)}
                placeholder="e.g. CGPA re-evaluated following semester audit"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs text-slate-900 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Superseded By Replacement Hash (Optional):
              </label>
              <input
                type="text"
                value={supersededByHash}
                onChange={(e) => setSupersededByHash(e.target.value)}
                placeholder="0x... (Leave empty if permanently cancelled)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-mono text-slate-900 focus:outline-hidden"
              />
            </div>

            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>Batch ID: <span className="font-mono font-semibold text-slate-800">{batch.batchId}</span></div>
              <div className="mt-1">
                Target: <span className="font-semibold text-slate-800">{batch.records[selectedLeafIndex]?.fullName}</span> (PRN: {batch.records[selectedLeafIndex]?.prn})
              </div>
            </div>

            <button
              onClick={handleRevoke}
              disabled={isSubmitting || batch.revokedIndices.includes(selectedLeafIndex)}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <AlertTriangle className="h-4 w-4" />
              <span>{isSubmitting ? "Updating On-Chain Bitmap..." : "Confirm Credential Revocation"}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4 py-2 text-center">
            <div className={`w-12 h-12 ${isSimulated ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"} rounded-full flex items-center justify-center mx-auto`}>
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                {isSimulated ? "Credential Revocation Simulated" : "Credential Successfully Revoked On-Chain!"}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {isSimulated
                  ? "Revocation recorded in local state registry. Any future verification checks will flag this degree as Revoked."
                  : "Bitmap bit inverted on Sepolia. Any future verification checks will flag this degree as Revoked."}
              </p>
              <div className="mt-2 flex items-center justify-center">
                {isSimulated ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[11px] font-bold">
                    ⚠️ Simulated — not on-chain
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-full text-[11px] font-bold">
                    ✓ Confirmed On-Chain (Sepolia)
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
