"use client";

import React, { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { ethers } from "ethers";
import {
  Layers,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  ShieldCheck,
  Flame,
  Clock,
  ExternalLink,
  ChevronRight,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import { StudentDegreeData, BatchRecord, W3CCredentialPayload } from "../../types";
import { buildBatchMerkleTree, createW3CCredential } from "../../lib/crypto";
import { generateCredentialsZip, downloadFile } from "../../lib/zipHelper";
import {
  getStoredBatches,
  saveStoredBatches,
  getSepoliaConfig,
  INITIAL_STUDENTS,
} from "../../lib/storage";
import { anchorMerkleBatch } from "../../lib/contracts";
import MerkleTreeVisualizer from "../../components/MerkleTreeVisualizer";
import BatchRevocationModal from "../../components/BatchRevocationModal";

export default function IssuerDashboardPage() {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [currentStudents, setCurrentStudents] = useState<StudentDegreeData[]>(INITIAL_STUDENTS);
  const [batchId, setBatchId] = useState<string>("MGM-2024-BTECH-BATCH02");
  const [computedTreeData, setComputedTreeData] = useState<any>(null);
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [anchorSuccess, setAnchorSuccess] = useState<any>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [revocationModalBatch, setRevocationModalBatch] = useState<BatchRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBatches();
    recalculateTree(INITIAL_STUDENTS);
  }, []);

  const loadBatches = () => {
    const stored = getStoredBatches();
    setBatches(stored);
  };

  const recalculateTree = (students: StudentDegreeData[]) => {
    if (students.length === 0) return;
    const treeData = buildBatchMerkleTree(students);
    setComputedTreeData(treeData);
  };

  const handleCsvUpload = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const parsedStudents: StudentDegreeData[] = results.data.map((row: any, i: number) => ({
            prn: (row.PRN || row.prn || `PRN2024${i + 1}`).trim().toUpperCase(),
            fullName: (row.FullName || row.fullName || row.Name || "Student").trim(),
            degree: (row.Degree || row.degree || "Bachelor of Technology").trim(),
            branch: (row.Branch || row.branch || "Computer Science & Engineering").trim(),
            cgpa: parseFloat(row.CGPA || row.cgpa || "8.50"),
            graduationYear: parseInt(row.Year || row.year || row.GraduationYear || "2024", 10),
            issueDate: row.IssueDate || row.issueDate || "2024-06-15",
            nheqfCredits: parseInt(row.Credits || row.credits || "160", 10),
            nheqfLevel: parseFloat(row.Level || row.level || "6.0"),
            university: row.University || "MGM University, Chhatrapati Sambhajinagar",
            institutionCode: "MGMU-ENG-01",
            division: "First Class with Distinction",
          }));

          if (parsedStudents.length > 0) {
            setCurrentStudents(parsedStudents);
            recalculateTree(parsedStudents);
            setBatchId(`MGM-${parsedStudents[0].graduationYear}-BATCH-${Date.now().toString().slice(-4)}`);
            setAnchorSuccess(null);
          }
        } catch (e: any) {
          alert("Error parsing CSV format: " + e?.message);
        }
      },
    });
  };

  const handleAnchorToSepolia = async () => {
    if (!computedTreeData) return;

    setIsAnchoring(true);
    setAnchorSuccess(null);

    try {
      let signer = null;
      if (typeof window !== "undefined" && (window as any).ethereum) {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        signer = await provider.getSigner().catch(() => null);
      }

      const ipfsCid = "Qm" + ethers.hexlify(ethers.randomBytes(22)).slice(2);
      const res = await anchorMerkleBatch(
        batchId,
        computedTreeData.rootHex,
        ipfsCid,
        signer
      );

      const newBatch: BatchRecord = {
        batchId,
        merkleRoot: computedTreeData.rootHex,
        ipfsCid,
        timestamp: Math.floor(Date.now() / 1000),
        issuer: signer ? await signer.getAddress() : "0x71C56538b15294500B73f8472B4fE963D4e58bEf",
        totalCredentials: currentStudents.length,
        revokedIndices: [],
        records: currentStudents,
      };

      const updatedBatches = [newBatch, ...batches.filter((b) => b.batchId !== batchId)];
      saveStoredBatches(updatedBatches);
      setBatches(updatedBatches);
      setAnchorSuccess({
        txHash: res.txHash,
        batchId,
        merkleRoot: computedTreeData.rootHex,
      });
    } catch (e: any) {
      console.error("Anchoring failed:", e);
      alert("Anchoring failed: " + e?.message);
    } finally {
      setIsAnchoring(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!computedTreeData) return;
    setIsZipping(true);

    try {
      const config = getSepoliaConfig();
      const credentials: W3CCredentialPayload[] = currentStudents.map((student, idx) => {
        return createW3CCredential(
          student,
          {
            batchId,
            leafIndex: idx,
            leafHash: computedTreeData.leavesHex[idx],
            rootHash: computedTreeData.rootHex,
            proof: computedTreeData.proofs[idx].proof,
            contractAddress: config.credentialRegistryAddress,
            network: "sepolia",
            chainId: 11155111,
          },
          "0x71C56538b15294500B73f8472B4fE963D4e58bEf"
        );
      });

      const zipBlob = await generateCredentialsZip(credentials, batchId);
      downloadFile(zipBlob, `student_credentials_${batchId}.zip`, "application/zip");
    } catch (e: any) {
      console.error("Zip generation error:", e);
    } finally {
      setIsZipping(false);
    }
  };

  const loadSampleCsv = () => {
    fetch("/fixtures/sample_batch.csv")
      .then((res) => res.text())
      .then((csvText) => {
        const file = new File([csvText], "sample_batch.csv", { type: "text/csv" });
        handleCsvUpload(file);
      });
  };

  return (
    <div className="space-y-8 py-2">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 border border-amber-200 text-amber-900 rounded-full text-xs font-semibold mb-2">
          <Layers className="h-3.5 w-3.5 text-amber-700" />
          <span>Exam Cell Examination Authority</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Exam Cell Batch Minting &amp; Dynamic Revocation
        </h1>
        <p className="text-xs sm:text-sm text-slate-600">
          Upload graduation batches, calculate Keccak256 binary Merkle Trees on-the-fly, and anchor 1,000+ degrees in a single O(1) Sepolia transaction.
        </p>
      </div>

      {/* Main Minting Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Batch Configuration & CSV Upload */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-900" />
              <span>1. Ingest Graduation Batch</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Batch Identifier:
              </label>
              <input
                type="text"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* CSV Drop Area */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files?.[0] && handleCsvUpload(e.target.files[0])}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/50 rounded-2xl p-5 text-center cursor-pointer transition-colors space-y-2"
            >
              <UploadCloud className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">
                Click to upload Graduation CSV
              </p>
              <p className="text-[11px] text-slate-400">
                Columns: PRN, FullName, Degree, Branch, CGPA, Year
              </p>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-500">Need a sample file?</span>
              <button
                type="button"
                onClick={loadSampleCsv}
                className="text-blue-700 hover:underline font-semibold"
              >
                Load Sample Batch CSV
              </button>
            </div>

            {/* Ingested Records Summary */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Records Loaded:</span>
                <span className="font-bold text-slate-900">{currentStudents.length} Students</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tree Leaves:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {computedTreeData?.leavesHex.length || 0} Keccak Hashes
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={handleAnchorToSepolia}
                disabled={isAnchoring || !computedTreeData}
                className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{isAnchoring ? "Broadcasting to Sepolia..." : "Anchor Batch to Sepolia"}</span>
              </button>

              <button
                onClick={handleDownloadZip}
                disabled={isZipping || !computedTreeData}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>{isZipping ? "Generating ZIP..." : "Download All Student JSON Files (.zip)"}</span>
              </button>
            </div>

            {anchorSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs space-y-1">
                <div className="flex items-center gap-1 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Batch Successfully Anchored!</span>
                </div>
                <p className="font-mono text-[11px] text-emerald-800 truncate">
                  Tx: {anchorSuccess.txHash}
                </p>
                <p className="text-[10px] text-emerald-700">
                  32-byte Merkle root committed to CredentialRegistry.sol
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interactive Merkle Tree Visualizer & Batch History */}
        <div className="lg:col-span-2 space-y-6">
          {computedTreeData && (
            <MerkleTreeVisualizer
              rootHash={computedTreeData.rootHex}
              records={currentStudents}
              proofs={computedTreeData.proofs}
            />
          )}

          {/* Anchored Batches Registry & Revocation Management */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Anchored Batches &amp; Dynamic Revocation Registry
                </h3>
                <p className="text-xs text-slate-500">
                  Manage on-chain Merkle roots and invalidate credentials via 256-bit dynamic bitmaps
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {batches.map((b) => (
                <div
                  key={b.batchId}
                  className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-900">
                        {b.batchId}
                      </span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
                        {b.totalCredentials} Degrees
                      </span>
                      {b.revokedIndices?.length > 0 && (
                        <span className="text-[10px] bg-red-100 text-red-800 font-semibold px-2 py-0.5 rounded-full">
                          {b.revokedIndices.length} Revoked
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-slate-500 truncate max-w-sm sm:max-w-md">
                      Root: {b.merkleRoot}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setRevocationModalBatch(b)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-700" />
                      <span>Manage Revocations</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Bitmap Revocation Modal */}
      {revocationModalBatch && (
        <BatchRevocationModal
          isOpen={true}
          onClose={() => setRevocationModalBatch(null)}
          batch={revocationModalBatch}
          onRevokedSuccess={() => {
            loadBatches();
          }}
        />
      )}
    </div>
  );
}
