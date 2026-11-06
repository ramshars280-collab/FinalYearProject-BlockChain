"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Award,
  FileText,
  Download,
  Eye,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Building2,
  ShieldCheck,
  Cpu,
  GraduationCap,
} from "lucide-react";
import { BatchRecord, StudentDegreeData, W3CCredentialPayload, VerificationResult, BatchStatus } from "../types";
import { buildBatchMerkleTree, createW3CCredential } from "../lib/crypto";
import DegreeCertificate from "./DegreeCertificate";

export interface IssuerCertificateItem {
  certificateId: string;
  batchId: string;
  leafIndex: number;
  batchStatus: string;
  txHash?: string | null;
  expectedChainId?: number;
  merkleRoot: string;
  institutionName: string;
  institutionCode: string;
  student: StudentDegreeData;
  pdfUrl: string;
  revoked: boolean;
}

interface IssuerCertificatesListProps {
  batches: BatchRecord[];
  institutionCode?: string;
  institutionName?: string;
  selectedChainId?: number;
  refreshTrigger?: number;
}

export default function IssuerCertificatesList({
  batches,
  institutionCode = "MGMU-ENG-01",
  institutionName = "MGM University",
  selectedChainId = 31337,
  refreshTrigger = 0,
}: IssuerCertificatesListProps) {
  const [certificates, setCertificates] = useState<IssuerCertificateItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ANCHORED" | "INSTITUTIONAL_STORED" | "REVOKED">("ALL");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Modal State for Viewing Certificate
  const [selectedCert, setSelectedCert] = useState<IssuerCertificateItem | null>(null);
  const [modalCredential, setModalCredential] = useState<W3CCredentialPayload | null>(null);
  const [modalVerification, setModalVerification] = useState<VerificationResult | null>(null);

  // Fetch certificates from the dedicated secure API endpoint
  const fetchCertificates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/certificates", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.certificates)) {
          const mapped: IssuerCertificateItem[] = data.certificates.map((c: any) => ({
            certificateId: c.certificateId || c.id || `${c.batchId}-${c.leafIndex}`,
            batchId: c.batchId,
            leafIndex: c.leafIndex,
            batchStatus: c.batchStatus || "INSTITUTIONAL_STORED",
            txHash: c.txHash || null,
            expectedChainId: c.expectedChainId || 31337,
            merkleRoot: c.merkleRoot,
            institutionName: c.institutionName || institutionName,
            institutionCode: c.institutionCode || institutionCode,
            student: c.student || c.rawRecord || {
              prn: c.prn || "UNKNOWN",
              fullName: c.studentName || "Unknown Student",
              degree: c.degree || "Bachelor of Technology",
              branch: c.branch || "General",
              cgpa: typeof c.cgpa === "number" ? c.cgpa : 0,
              graduationYear: c.graduationYear,
              issueDate: c.issueDate || "2024-06-15",
              university: c.institute || institutionName,
            },
            pdfUrl: c.pdfUrl || c.pdfDownloadUrl || `/api/certificates/${encodeURIComponent(c.batchId)}/${c.leafIndex}/pdf`,
            revoked: Boolean(c.revoked ?? c.isRevoked),
          }));
          setCertificates(mapped);
          setLoading(false);
          return;
        }
      }

      // If API route failed or returned unauthorized, fallback to extracting from loaded batches
      console.warn("API /api/certificates returned non-200, deriving from loaded batches...");
      deriveCertificatesFromBatches();
    } catch (err: any) {
      console.warn("Could not fetch /api/certificates, falling back to loaded batches:", err);
      deriveCertificatesFromBatches();
    } finally {
      setLoading(false);
    }
  };

  const deriveCertificatesFromBatches = () => {
    const derived: IssuerCertificateItem[] = [];
    batches.forEach((b) => {
      if (!Array.isArray(b.records)) return;
      b.records.forEach((s, idx) => {
        const isRevoked = Array.isArray(b.revokedIndices) && b.revokedIndices.includes(idx);
        derived.push({
          certificateId: `${b.batchId}-${idx}-${s.prn}`,
          batchId: b.batchId,
          leafIndex: idx,
          batchStatus: b.status || "INSTITUTIONAL_STORED",
          txHash: b.txHash || null,
          expectedChainId: b.expectedChainId || 31337,
          merkleRoot: b.merkleRoot,
          institutionName: b.institutionName || institutionName,
          institutionCode: b.institutionCode || institutionCode,
          student: s,
          pdfUrl: `/api/certificates/${encodeURIComponent(b.batchId)}/${idx}/pdf`,
          revoked: isRevoked,
        });
      });
    });
    setCertificates(derived);
  };

  useEffect(() => {
    fetchCertificates();
  }, [batches, refreshTrigger]);

  // Filter and search
  const filteredCertificates = useMemo(() => {
    return certificates.filter((item) => {
      // Status filter
      if (statusFilter === "ANCHORED" && item.batchStatus !== "ANCHORED") return false;
      if (statusFilter === "INSTITUTIONAL_STORED" && item.batchStatus === "ANCHORED") return false;
      if (statusFilter === "REVOKED" && !item.revoked) return false;

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchesName = item.student.fullName?.toLowerCase().includes(q);
        const matchesPrn = item.student.prn?.toLowerCase().includes(q);
        const matchesDegree = item.student.degree?.toLowerCase().includes(q);
        const matchesBranch = item.student.branch?.toLowerCase().includes(q);
        const matchesBatch = item.batchId.toLowerCase().includes(q);
        return matchesName || matchesPrn || matchesDegree || matchesBranch || matchesBatch;
      }
      return true;
    });
  }, [certificates, statusFilter, searchTerm]);

  // Reset page when filter/search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCertificates.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCerts = useMemo(() => {
    const startIdx = (validCurrentPage - 1) * pageSize;
    return filteredCertificates.slice(startIdx, startIdx + pageSize);
  }, [filteredCertificates, validCurrentPage, pageSize]);

  const pageStart = filteredCertificates.length === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(validCurrentPage * pageSize, filteredCertificates.length);

  // Handle View Certificate Action
  const handleViewCertificate = (item: IssuerCertificateItem) => {
    const batch = batches.find((b) => b.batchId.toLowerCase() === item.batchId.toLowerCase());
    let proofObj: any;

    if (batch && Array.isArray(batch.records) && batch.records.length > 0) {
      const tree = buildBatchMerkleTree(batch.records);
      const isAnchored = item.batchStatus === "ANCHORED" && Boolean(item.txHash);
      proofObj = {
        ...tree.proofs[item.leafIndex],
        batchId: item.batchId,
        contractAddress: isAnchored ? (batch.expectedContract || "") : "",
        network: isAnchored
          ? (item.expectedChainId === 31337 ? "Hardhat Local" : "Ethereum Sepolia")
          : "Local Institutional Registry",
        ...(item.expectedChainId ? { chainId: item.expectedChainId } : {}),
      };
    } else {
      proofObj = {
        batchId: item.batchId,
        root: item.merkleRoot,
        leafIndex: item.leafIndex,
        totalLeaves: 1,
        proof: [],
        contractAddress: "",
        network: item.batchStatus === "ANCHORED" ? "Ethereum Sepolia" : "Local Institutional Registry",
      };
    }

    const cred = createW3CCredential(
      item.student,
      proofObj,
      batch?.issuer || "0x8D0cC3553e9d812797B986F15427835A2930a301",
      item.institutionName,
      item.institutionCode
    );

    const isAnchored = item.batchStatus === "ANCHORED" && Boolean(item.txHash);
    const verResult: VerificationResult = {
      isValid: !item.revoked,
      isRevoked: item.revoked,
      tamperDetected: false,
      batchId: item.batchId,
      leafIndex: item.leafIndex,
      matchedRoot: item.merkleRoot,
      txHash: item.txHash || undefined,
      network: isAnchored
        ? (item.expectedChainId === 31337 ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)")
        : "Institutional DB",
      verifiedAt: new Date().toISOString(),
      issuingInstitutionName: item.institutionName,
      isOnChainAnchored: isAnchored,
      batchStatus: item.batchStatus as BatchStatus,
    };

    setModalCredential(cred);
    setModalVerification(verResult);
    setSelectedCert(item);
  };

  const anchoredCount = certificates.filter((c) => c.batchStatus === "ANCHORED").length;
  const storedCount = certificates.filter((c) => c.batchStatus !== "ANCHORED").length;
  const revokedCount = certificates.filter((c) => c.revoked).length;

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in duration-300">
      {/* 1. Header with Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-gradient-to-tr from-amber-600 to-blue-700 text-white rounded-2xl shrink-0 mt-0.5 shadow-md shadow-blue-500/20">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                Issued Student Certificates
              </h3>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-950 border border-blue-300 shadow-2xs">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span>{certificates.length} Total Certificates</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              View and download authentic academic credentials issued by{" "}
              <strong className="text-slate-700">{institutionName}</strong> ({institutionCode}).
            </p>
          </div>
        </div>

        <button
          onClick={fetchCertificates}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
          title="Refresh certificates list"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* 2. Filter Pills & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 mr-1">Filter Status:</span>
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "ALL"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            All ({certificates.length})
          </button>
          <button
            onClick={() => setStatusFilter("ANCHORED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "ANCHORED"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            }`}
          >
            Anchored On-Chain ({anchoredCount})
          </button>
          <button
            onClick={() => setStatusFilter("INSTITUTIONAL_STORED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "INSTITUTIONAL_STORED"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-blue-50 text-blue-800 hover:bg-blue-100"
            }`}
          >
            Institutional DB ({storedCount})
          </button>
          {revokedCount > 0 && (
            <button
              onClick={() => setStatusFilter("REVOKED")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === "REVOKED"
                  ? "bg-red-600 text-white shadow-xs"
                  : "bg-red-50 text-red-800 hover:bg-red-100"
              }`}
            >
              Revoked ({revokedCount})
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative min-w-[280px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by student name, PRN, or major..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Certificates Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-2xs">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px] tracking-wide">
            <tr>
              <th className="p-3.5">Student &amp; PRN</th>
              <th className="p-3.5">Degree &amp; Major</th>
              <th className="p-3.5 text-center">CGPA</th>
              <th className="p-3.5">Issue Date</th>
              <th className="p-3.5">Batch &amp; Status</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <RefreshCw className="h-6 w-6 text-blue-600 animate-spin" />
                    <p className="text-xs font-bold text-slate-700">Loading student certificates...</p>
                  </div>
                </td>
              </tr>
            ) : paginatedCerts.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <GraduationCap className="h-8 w-8 text-slate-300" />
                    <p className="font-bold text-slate-700 text-xs">
                      {certificates.length === 0
                        ? "No student certificates found in the registry"
                        : "No certificates match your search/filter criteria"}
                    </p>
                    <p className="text-[11px] text-slate-400 max-w-md">
                      {certificates.length === 0
                        ? "Upload a student CSV batch above and confirm issuance to generate verifiable credentials."
                        : "Try clearing your search query or selecting 'All' in the filter."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedCerts.map((cert) => {
                const isAnchored = cert.batchStatus === "ANCHORED";
                return (
                  <tr key={cert.certificateId} className="hover:bg-slate-50/80 transition-colors">
                    {/* Student & PRN */}
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900">{cert.student.fullName}</div>
                      <div className="font-mono text-[11px] text-blue-700 font-semibold">{cert.student.prn}</div>
                    </td>

                    {/* Degree & Major */}
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-800">{cert.student.degree}</div>
                      <div className="text-[11px] text-slate-500">{cert.student.branch}</div>
                    </td>

                    {/* CGPA */}
                    <td className="p-3.5 text-center font-mono font-bold text-slate-800">
                      {cert.student.cgpa ? cert.student.cgpa.toFixed(2) : "—"}
                    </td>

                    {/* Issue Date */}
                    <td className="p-3.5 text-slate-600 font-mono text-[11px]">
                      {cert.student.issueDate || "—"}
                    </td>

                    {/* Batch & Status */}
                    <td className="p-3.5">
                      <div className="font-mono text-[11px] text-slate-600 font-bold truncate max-w-[130px]" title={cert.batchId}>
                        {cert.batchId}
                      </div>
                      <div className="mt-1">
                        {cert.revoked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-900 border border-red-300 rounded-full text-[10px] font-bold">
                            <AlertCircle className="h-2.5 w-2.5 text-red-600" />
                            <span>Revoked</span>
                          </span>
                        ) : isAnchored ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-full text-[10px] font-bold">
                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                            <span>{cert.expectedChainId === 31337 ? "Hardhat Local" : "Sepolia On-Chain"}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-300 rounded-full text-[10px] font-bold">
                            <Building2 className="h-2.5 w-2.5 text-blue-600" />
                            <span>Institutional DB</span>
                          </span>
                        )}
                      </div>
                      {cert.txHash && isAnchored && (
                        cert.expectedChainId === 11155111 ? (
                          <a
                            href={`https://sepolia.etherscan.io/tx/${cert.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline font-mono mt-0.5 block truncate max-w-[120px]"
                            title={cert.txHash}
                          >
                            <ExternalLink className="h-2 w-2" />
                            <span>{cert.txHash.slice(0, 8)}...</span>
                          </a>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] text-indigo-700 font-mono mt-0.5 block truncate max-w-[120px]"
                            title={`Local Hardhat Tx: ${cert.txHash}`}
                          >
                            <Cpu className="h-2 w-2" />
                            <span>{cert.txHash.slice(0, 8)}...</span>
                          </span>
                        )
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => handleViewCertificate(cert)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1"
                        title="View Certificate"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View</span>
                      </button>

                      <a
                        href={cert.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1"
                        title="Download Original Vector PDF"
                      >
                        <Download className="h-3.5 w-3.5 text-blue-600" />
                        <span>PDF</span>
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Pagination */}
      {filteredCertificates.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 border-t border-slate-100 pt-4">
          <div>
            Showing <strong className="text-slate-800">{pageStart}</strong> to{" "}
            <strong className="text-slate-800">{pageEnd}</strong> of{" "}
            <strong className="text-slate-800">{filteredCertificates.length}</strong> certificates
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validCurrentPage <= 1}
              className="p-2 border border-slate-200 rounded-xl hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 py-1 font-mono font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl">
              Page {validCurrentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage >= totalPages}
              className="p-2 border border-slate-200 rounded-xl hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Next Page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 5. View Certificate Modal */}
      {selectedCert && modalCredential && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
          <div className="relative bg-white w-full max-w-5xl rounded-3xl p-5 sm:p-8 shadow-2xl border border-slate-200 my-auto space-y-6 animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-2xl">
                  <Award className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    Issued Degree Certificate
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedCert.student.fullName} &bull; PRN:{" "}
                    <span className="font-mono font-bold text-slate-800">{selectedCert.student.prn}</span> &bull; Batch:{" "}
                    <span className="font-mono font-bold text-slate-800">{selectedCert.batchId}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <a
                  href={selectedCert.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Official PDF</span>
                </a>
                <button
                  onClick={() => {
                    setSelectedCert(null);
                    setModalCredential(null);
                    setModalVerification(null);
                  }}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close Preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Embedded Degree Certificate Component */}
            <div className="overflow-y-auto pr-1 flex-1">
              <DegreeCertificate
                credential={modalCredential}
                verification={modalVerification}
                batchStatus={selectedCert.batchStatus as BatchStatus}
                txHash={selectedCert.txHash}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
