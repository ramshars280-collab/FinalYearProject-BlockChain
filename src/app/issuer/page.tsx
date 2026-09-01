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
  Cpu,
  TrendingDown,
  Terminal,
  LogOut,
  Shield,
  Lock,
  Building2,
  PlusCircle,
} from "lucide-react";
import { StudentDegreeData, BatchRecord, W3CCredentialPayload, ConsortiumInstitution } from "../../types";
import { buildBatchMerkleTree, createW3CCredential } from "../../lib/crypto";
import { generateCredentialsZip, downloadFile } from "../../lib/zipHelper";
import {
  getStoredBatches,
  saveStoredBatches,
  getSepoliaConfig,
  getConsortiumInstitutions,
  INITIAL_STUDENTS_MGM,
  INITIAL_STUDENTS_SPPU,
} from "../../lib/storage";
import { anchorMerkleBatch } from "../../lib/contracts";
import MerkleTreeVisualizer from "../../components/MerkleTreeVisualizer";
import BatchRevocationModal from "../../components/BatchRevocationModal";
import RegisterUniversityModal from "../../components/RegisterUniversityModal";
import AuthGuard from "../../components/AuthGuard";
import { useAuth } from "../../context/AuthContext";

export default function IssuerDashboardPage() {
  return (
    <AuthGuard
      requiredRole="EXAM_ADMIN"
      title="Exam Cell Authority Gate"
      description="Restricted to University Controller of Examinations and authorized Exam Cell staff for batch Merkle root anchoring and dynamic 256-bit revocation bitmap management on Ethereum Sepolia."
    >
      <IssuerDashboardContent />
    </AuthGuard>
  );
}

function IssuerDashboardContent() {
  const { user, logout } = useAuth();
  const [institutions, setInstitutions] = useState<ConsortiumInstitution[]>([]);
  const [selectedInstitution, setSelectedInstitution] = useState<ConsortiumInstitution | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [currentStudents, setCurrentStudents] = useState<StudentDegreeData[]>(INITIAL_STUDENTS_MGM);
  const [batchId, setBatchId] = useState<string>("MGM-2024-BTECH-BATCH02");
  const [computedTreeData, setComputedTreeData] = useState<any>(null);
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [anchorSuccess, setAnchorSuccess] = useState<any>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [revocationModalBatch, setRevocationModalBatch] = useState<BatchRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadInstitutions();
    loadBatches();
    recalculateTree(INITIAL_STUDENTS_MGM);
  }, []);

  const loadInstitutions = () => {
    const list = getConsortiumInstitutions();
    setInstitutions(list);
    if (!selectedInstitution && list.length > 0) {
      setSelectedInstitution(list[0]);
    }
  };

  const loadBatches = () => {
    const stored = getStoredBatches();
    setBatches(stored);
  };

  const recalculateTree = (students: StudentDegreeData[]) => {
    if (students.length === 0) return;
    const treeData = buildBatchMerkleTree(students);
    setComputedTreeData(treeData);
  };

  const handleInstitutionChange = (instId: string) => {
    const inst = institutions.find((u) => u.id === instId) || institutions[0];
    if (!inst) return;
    setSelectedInstitution(inst);
    
    // Choose sample students for selected university
    const studentsToLoad = inst.id === "sppu" ? INITIAL_STUDENTS_SPPU : INITIAL_STUDENTS_MGM.map(s => ({
      ...s,
      university: inst.name,
      institutionCode: inst.code,
    }));

    setCurrentStudents(studentsToLoad);
    recalculateTree(studentsToLoad);
    setBatchId(`${inst.shortName.replace(/[^a-zA-Z0-9]/g, '')}-2024-BATCH-${Date.now().toString().slice(-4)}`);
    setAnchorSuccess(null);
  };

  const handleNewUniversityRegistered = (newInst: ConsortiumInstitution) => {
    loadInstitutions();
    setSelectedInstitution(newInst);

    const defaultStudents: StudentDegreeData[] = [
      {
        prn: `${newInst.shortName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}202401`,
        fullName: "Aryan Verma",
        degree: "Bachelor of Technology",
        branch: "Computer Science & Engineering",
        cgpa: 9.10,
        graduationYear: 2024,
        issueDate: "2024-06-25",
        nheqfCredits: 160,
        nheqfLevel: 6.0,
        university: newInst.name,
        institutionCode: newInst.code,
        division: "First Class with Distinction",
      },
      {
        prn: `${newInst.shortName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}202402`,
        fullName: "Meera Nair",
        degree: "Bachelor of Technology",
        branch: "Artificial Intelligence",
        cgpa: 8.92,
        graduationYear: 2024,
        issueDate: "2024-06-25",
        nheqfCredits: 160,
        nheqfLevel: 6.0,
        university: newInst.name,
        institutionCode: newInst.code,
        division: "First Class with Distinction",
      },
    ];

    setCurrentStudents(defaultStudents);
    recalculateTree(defaultStudents);
    setBatchId(`${newInst.shortName.replace(/[^a-zA-Z0-9]/g, '')}-2024-BATCH-${Date.now().toString().slice(-4)}`);
    setAnchorSuccess(null);
  };

  const handleCsvUpload = (file: File) => {
    if (!selectedInstitution) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const parsedStudents: StudentDegreeData[] = results.data.map((row: any, i: number) => ({
            prn: (row.PRN || row.prn || `${selectedInstitution.shortName.toUpperCase()}2024${i + 1}`).trim().toUpperCase(),
            fullName: (row.FullName || row.fullName || row.Name || "Student").trim(),
            degree: (row.Degree || row.degree || "Bachelor of Technology").trim(),
            branch: (row.Branch || row.branch || "Computer Science & Engineering").trim(),
            cgpa: parseFloat(row.CGPA || row.cgpa || "8.50"),
            graduationYear: parseInt(row.Year || row.year || row.GraduationYear || "2024", 10),
            issueDate: row.IssueDate || row.issueDate || "2024-06-15",
            nheqfCredits: parseInt(row.Credits || row.credits || "160", 10),
            nheqfLevel: parseFloat(row.Level || row.level || "6.0"),
            university: row.University || selectedInstitution.name,
            institutionCode: row.InstitutionCode || selectedInstitution.code,
            division: "First Class with Distinction",
          }));

          if (parsedStudents.length > 0) {
            setCurrentStudents(parsedStudents);
            recalculateTree(parsedStudents);
            setBatchId(`${selectedInstitution.shortName.replace(/[^a-zA-Z0-9]/g, '')}-${parsedStudents[0].graduationYear}-BATCH-${Date.now().toString().slice(-4)}`);
            setAnchorSuccess(null);
          }
        } catch (e: any) {
          alert("Error parsing CSV format: " + e?.message);
        }
      },
    });
  };

  const handleAnchorToSepolia = async () => {
    if (!computedTreeData || !selectedInstitution) return;

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
        issuer: selectedInstitution.address,
        institutionName: selectedInstitution.name,
        institutionCode: selectedInstitution.code,
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
        institutionName: selectedInstitution.name,
      });
    } catch (e: any) {
      console.error("Anchoring failed:", e);
      alert("Anchoring failed: " + e?.message);
    } finally {
      setIsAnchoring(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!computedTreeData || !selectedInstitution) return;
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
          selectedInstitution.address,
          selectedInstitution.name,
          selectedInstitution.code
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

  const activeInst = selectedInstitution || institutions[0];

  return (
    <div className="space-y-8 py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 text-blue-900 rounded-full text-xs font-bold mb-2">
            <Shield className="h-3.5 w-3.5 text-blue-600" />
            <span>Inter-University Consortium Authority &bull; {user?.fullName}</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Exam Cell Multi-University Minting &amp; Dynamic Revocation
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Anchor cryptographic Merkle roots for any consortium institution and manage dynamic 256-bit bitmap revocations on Ethereum Sepolia.
          </p>
        </div>

        <button
          onClick={() => logout()}
          className="self-start sm:self-center px-4 py-2 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Consortium Institution Selection Bar with Option to Register New University */}
      <div className="bg-white p-6 rounded-3xl border border-blue-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Active Issuing University / Consortium Partner
              </h3>
              <p className="text-[11px] text-slate-500">
                Select an issuing university or register an external institution to join the consortium
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all hover:scale-102"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>+ Register New University</span>
            </button>

            {activeInst && (
              <span className="text-xs font-mono font-bold text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl">
                Code: {activeInst.code}
              </span>
            )}
          </div>
        </div>

        {/* Institution Cards Carousel / Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {institutions.map((inst) => (
            <div
              key={inst.id}
              onClick={() => handleInstitutionChange(inst.id)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                activeInst?.id === inst.id
                  ? "bg-blue-50 border-blue-600 ring-2 ring-blue-500/20 shadow-xs"
                  : "bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-black text-slate-900">{inst.shortName}</span>
                {activeInst?.id === inst.id && (
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                )}
              </div>
              <div className="text-[11px] font-medium text-slate-700 leading-snug">{inst.name}</div>
              <div className="text-[10px] text-slate-500 mt-1">{inst.city}, {inst.state}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Gas Optimization Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-600 rounded-xl">
            <TrendingDown className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Gas Economy</span>
            <div className="text-lg font-black text-blue-900">99.8% Cost Reduction</div>
            <p className="text-[10px] text-emerald-700 font-bold">1 Tx anchors 1,000+ credentials</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-600 rounded-xl">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Consortium Registry</span>
            <div className="text-lg font-black text-blue-900">Multi-Org Smart Contract</div>
            <p className="text-[10px] text-blue-700 font-medium">{activeInst?.name || "Consortium Node"}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-600 rounded-xl">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">DPDP Act Guard</span>
            <div className="text-lg font-black text-blue-900">Zero-PII Storage</div>
            <p className="text-[10px] text-blue-700 font-medium">Only 32-byte root on Sepolia</p>
          </div>
        </div>
      </div>

      {/* Main Minting Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Batch Configuration & CSV Upload */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              <span>1. Ingest Graduation Batch</span>
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
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
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/30 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2"
            >
              <UploadCloud className="h-9 w-9 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700">
                Click to upload Graduation CSV Batch
              </p>
              <p className="text-[11px] text-slate-400">
                Institution: {activeInst?.name}
              </p>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-500">Sample CSV fixture?</span>
              <button
                type="button"
                onClick={loadSampleCsv}
                className="text-blue-600 hover:underline font-bold"
              >
                Load Sample Batch CSV
              </button>
            </div>

            {/* Ingested Records Summary */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Issuing University:</span>
                <span className="font-bold text-slate-900">{activeInst?.shortName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Records Ingested:</span>
                <span className="font-bold text-slate-900">{currentStudents.length} Candidates</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tree Leaves:</span>
                <span className="font-mono font-bold text-blue-700">
                  {computedTreeData?.leavesHex.length || 0} Keccak Hashes
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={handleAnchorToSepolia}
                disabled={isAnchoring || !computedTreeData}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-102 active:scale-98 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{isAnchoring ? "Broadcasting to Sepolia..." : `Anchor Batch for ${activeInst?.shortName}`}</span>
              </button>

              <button
                onClick={handleDownloadZip}
                disabled={isZipping || !computedTreeData}
                className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all hover:scale-102 shadow-2xs"
              >
                <Download className="h-4 w-4 text-blue-600" />
                <span>{isZipping ? "Generating ZIP..." : "Download All Student JSON Files (.zip)"}</span>
              </button>
            </div>

            {anchorSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs space-y-1.5 shadow-xs">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Batch Anchored to Ethereum Sepolia!</span>
                </div>
                <p className="text-[11px] text-emerald-800 font-semibold">
                  Issuing University: {anchorSuccess.institutionName}
                </p>
                <p className="text-[10px] text-emerald-700">
                  32-byte Merkle root committed to CredentialRegistry.sol
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interactive Merkle Tree Visualizer & Data Grid */}
        <div className="lg:col-span-2 space-y-6">
          {computedTreeData && (
            <MerkleTreeVisualizer
              rootHash={computedTreeData.rootHex}
              records={currentStudents}
              proofs={computedTreeData.proofs}
            />
          )}

          {/* Anchored Batches Registry & Revocation Management */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Consortium Batches &amp; Dynamic Revocation Switchboard
                </h3>
                <p className="text-xs text-slate-500">
                  Manage on-chain Merkle roots across consortium institutions and invalidate credentials via 256-bit bitmaps
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {batches.map((b) => (
                <div
                  key={b.batchId}
                  className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-900">
                        {b.batchId}
                      </span>
                      <span className="text-[10px] bg-blue-100 text-blue-900 border border-blue-200 font-bold px-2 py-0.5 rounded-full">
                        {b.institutionName || "Consortium University"}
                      </span>
                      <span className="text-[10px] bg-slate-200 text-slate-800 font-bold px-2 py-0.5 rounded-full">
                        {b.totalCredentials} Degrees
                      </span>
                      {b.revokedIndices?.length > 0 && (
                        <span className="text-[10px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full">
                          {b.revokedIndices.length} Revoked
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-slate-500 truncate max-w-sm sm:max-w-md">
                      Anchor Hash: {b.merkleRoot ? `${b.merkleRoot.slice(0, 10)}••••••••${b.merkleRoot.slice(-8)}` : "Verified Root"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setRevocationModalBatch(b)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all hover:scale-102"
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

      {/* Modal: Register New University */}
      <RegisterUniversityModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onRegistered={handleNewUniversityRegistered}
      />
    </div>
  );
}
