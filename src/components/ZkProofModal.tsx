"use client";

import React, { useState } from "react";
import { X, Sparkles, Shield, EyeOff, Check, Download, ArrowRight } from "lucide-react";
import { W3CCredentialPayload } from "../types";
import { generateZkSelectiveProof } from "../lib/zkProof";
import { downloadFile } from "../lib/zipHelper";

interface ZkProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  credential: W3CCredentialPayload;
}

export default function ZkProofModal({
  isOpen,
  onClose,
  credential,
}: ZkProofModalProps) {
  const subject = credential.credentialSubject;
  const [thresholdCgpa, setThresholdCgpa] = useState<number>(7.5);
  const [redactPii, setRedactPii] = useState<boolean>(true);
  const [generatedProofCred, setGeneratedProofCred] = useState<W3CCredentialPayload | null>(null);

  if (!isOpen) return null;

  const handleGenerate = () => {
    const zkCred = generateZkSelectiveProof(credential, thresholdCgpa, redactPii);
    setGeneratedProofCred(zkCred);
  };

  const handleDownload = () => {
    if (!generatedProofCred) return;
    const jsonStr = JSON.stringify(generatedProofCred, null, 2);
    downloadFile(
      jsonStr,
      `zk_proof_cgpa_gte_${thresholdCgpa}_${subject.prn}.json`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2.5 bg-purple-100 text-purple-800 rounded-xl">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Selective Disclosure Credential
            </h3>
            <p className="text-xs text-slate-500">
              India DPDP Act (Zero-PII &amp; Selective Attribute Proofs)
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
          Prove your academic eligibility (e.g. CGPA &ge; {thresholdCgpa}) to recruiters or universities without disclosing your exact numerical marks, PRN, or personal identifiers.
        </p>

        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select CGPA Range Assertion:
            </label>
            <div className="flex items-center gap-2">
              {[6.5, 7.0, 7.5, 8.0, 8.5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setThresholdCgpa(val);
                    setGeneratedProofCred(null);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    thresholdCgpa === val
                      ? "bg-purple-700 text-white border-purple-800 shadow-xs"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  &ge; {val}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Your Actual CGPA: <span className="font-semibold text-slate-800">{subject.cgpa}</span>{" "}
              {Number(subject.cgpa) >= thresholdCgpa ? (
                <span className="text-emerald-700 font-semibold">(Eligible)</span>
              ) : (
                <span className="text-red-700 font-semibold">(Below Threshold)</span>
              )}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">
                Redact Identifiers (DPDP Act Compliance)
              </span>
              <span className="text-[11px] text-slate-500">
                Hides PRN, Name &amp; Seat Number from credential payload
              </span>
            </div>
            <input
              type="checkbox"
              checked={redactPii}
              onChange={(e) => {
                setRedactPii(e.target.checked);
                setGeneratedProofCred(null);
              }}
              className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Action Button */}
        {!generatedProofCred ? (
          <button
            onClick={handleGenerate}
            disabled={Number(subject.cgpa) < thresholdCgpa}
            className="w-full mt-5 py-2.5 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            <span>Generate Selective Disclosure Credential</span>
          </button>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-start gap-2">
              <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Selective Disclosure Credential Created!</span>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Commitment: {generatedProofCred.proof.zkProof?.commitmentHash.slice(0, 18)}...
                </p>
              </div>
            </div>

            <button
              onClick={handleDownload}
              className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Download Selective Disclosure JSON</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
