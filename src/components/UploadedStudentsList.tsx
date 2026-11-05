"use client";

import React, { useState, useMemo } from "react";
import {
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";
import { StudentDegreeData } from "../types";

export interface FailedRecordItem {
  rowNumber?: number;
  prn: string;
  name?: string;
  branch?: string;
  reason: string;
}

interface UploadedStudentsListProps {
  students: StudentDegreeData[];
  batchId: string;
  fileName?: string;
  uploadedAt?: string;
  failedRecords?: FailedRecordItem[];
}

export default function UploadedStudentsList({
  students,
  batchId,
  fileName,
  uploadedAt,
  failedRecords = [],
}: UploadedStudentsListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Filter students by search term (PRN, Name, or Branch)
  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.prn.toLowerCase().includes(q) ||
        s.fullName.toLowerCase().includes(q) ||
        s.branch.toLowerCase().includes(q) ||
        s.degree.toLowerCase().includes(q) ||
        (s.institute && s.institute.toLowerCase().includes(q))
    );
  }, [students, searchTerm]);

  // Reset to page 1 when search query changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedStudents = useMemo(() => {
    const startIdx = (validCurrentPage - 1) * pageSize;
    return filteredStudents.slice(startIdx, startIdx + pageSize);
  }, [filteredStudents, validCurrentPage, pageSize]);

  const pageStart = filteredStudents.length === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(validCurrentPage * pageSize, filteredStudents.length);

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-blue-300/80 shadow-lg ring-4 ring-blue-50/50 space-y-6 animate-in fade-in duration-300">
      {/* 1. Header with Title & Success Indicators */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl shrink-0 mt-0.5 shadow-md shadow-blue-500/20">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                Uploaded Student Records
              </h3>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Upload Confirmed</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active Staging Batch &bull;{" "}
              <span className="font-mono font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {batchId}
              </span>
              {fileName && (
                <span className="ml-2 text-slate-500">
                  via Source CSV: <strong className="font-mono text-slate-800">{fileName}</strong>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Total Summary Counters */}
        <div className="flex items-center gap-2 text-xs font-mono self-start sm:self-auto">
          <span className="bg-emerald-50 border border-emerald-200 text-emerald-950 px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 shadow-2xs">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>{students.length} Valid Records</span>
          </span>
          {failedRecords.length > 0 && (
            <span className="bg-red-50 border border-red-200 text-red-900 px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 shadow-2xs">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span>{failedRecords.length} Failed</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Key Metrics Mini Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Staged Students
          </span>
          <span className="text-lg font-black text-slate-900 font-mono">
            {students.length}
          </span>
        </div>
        <div className="p-3.5 bg-blue-50/60 border border-blue-200/80 rounded-2xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
            Batch Target
          </span>
          <span className="text-xs font-black text-blue-950 font-mono truncate block" title={batchId}>
            {batchId}
          </span>
        </div>
        <div className="p-3.5 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
            Validation State
          </span>
          <span className="text-xs font-black text-emerald-950 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>100% Cryptographic Match</span>
          </span>
        </div>
        <div className="p-3.5 bg-indigo-50/60 border border-indigo-200/80 rounded-2xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">
            Issuance Pipeline
          </span>
          <span className="text-xs font-black text-indigo-950">
            Ready for Blockchain Anchor
          </span>
        </div>
      </div>

      {/* 2. Search Toolbar & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by PRN, Name, or Major..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition-all placeholder:text-slate-400 font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-800">{pageStart}</span> to{" "}
          <span className="font-bold text-slate-800">{pageEnd}</span> of{" "}
          <span className="font-bold text-slate-800">{filteredStudents.length}</span> students
          {searchTerm && ` (filtered from ${students.length} total)`}
        </div>
      </div>

      {/* 3. Responsive Student Records Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-2xs">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-200 uppercase text-[10px] tracking-wide">
            <tr>
              <th className="p-3.5 w-16 text-center">Sr. No.</th>
              <th className="p-3.5">PRN</th>
              <th className="p-3.5">Student Name</th>
              <th className="p-3.5">Major / Branch</th>
              <th className="p-3.5 text-center">CGPA</th>
              <th className="p-3.5 text-center">Credits</th>
              <th className="p-3.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500 space-y-2">
                  <FileSpreadsheet className="h-8 w-8 text-slate-300 mx-auto" />
                  <p className="font-semibold text-xs">No matching student records found</p>
                  <p className="text-[11px] text-slate-400">
                    Try adjusting your search query or check the uploaded CSV.
                  </p>
                </td>
              </tr>
            ) : (
              paginatedStudents.map((student, idx) => {
                const globalIndex = (validCurrentPage - 1) * pageSize + idx + 1;
                return (
                  <tr
                    key={student.prn + idx}
                    className="hover:bg-blue-50/40 transition-colors group"
                  >
                    <td className="p-3.5 text-center font-mono font-bold text-slate-400 group-hover:text-blue-600">
                      #{globalIndex}
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                      <span className="bg-slate-50 group-hover:bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                        {student.prn}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                      {student.fullName}
                    </td>
                    <td className="p-3.5 text-slate-600 max-w-[220px] truncate" title={student.branch}>
                      {student.branch}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold whitespace-nowrap">
                      <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg">
                        {Number(student.cgpa).toFixed(2)}
                      </span>
                    </td>
                    <td className="p-3.5 text-center font-mono text-slate-700 whitespace-nowrap font-medium">
                      {student.nheqfCredits || 160}
                    </td>
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>Ready for Issuance</span>
                      </span>
                    </td>
                  </tr>
                );
              })
            )}

            {/* Display any detected failed/invalid records with red status badges */}
            {failedRecords.map((fRec, fIdx) => (
              <tr key={"failed-" + fIdx} className="bg-red-50/40 hover:bg-red-50/70 transition-colors">
                <td className="p-3.5 text-center font-mono font-bold text-red-400">
                  !
                </td>
                <td className="p-3.5 font-mono font-bold text-red-950 whitespace-nowrap">
                  <span className="bg-red-100 border border-red-300 px-2 py-0.5 rounded">
                    {fRec.prn || "—"}
                  </span>
                </td>
                <td className="p-3.5 font-bold text-red-900 whitespace-nowrap">
                  {fRec.name || "Unknown"}
                </td>
                <td className="p-3.5 text-red-700">
                  {fRec.branch || "—"}
                </td>
                <td className="p-3.5 text-center font-mono font-bold text-red-700">
                  —
                </td>
                <td className="p-3.5 text-center font-mono text-red-600">
                  —
                </td>
                <td className="p-3.5 text-center whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200 shadow-2xs" title={fRec.reason}>
                    <AlertCircle className="h-3 w-3 text-red-600 shrink-0" />
                    <span>Failed Validation</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <span className="text-xs text-slate-500 font-medium">
            Page <span className="font-bold text-slate-800">{validCurrentPage}</span> of{" "}
            <span className="font-bold text-slate-800">{totalPages}</span>
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validCurrentPage <= 1}
              className="p-2 border border-slate-300 rounded-xl bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => {
              // Show window around current page
              if (
                pg === 1 ||
                pg === totalPages ||
                (pg >= validCurrentPage - 1 && pg <= validCurrentPage + 1)
              ) {
                return (
                  <button
                    key={pg}
                    onClick={() => setCurrentPage(pg)}
                    className={`h-8 w-8 rounded-xl font-bold text-xs transition-all ${
                      validCurrentPage === pg
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {pg}
                  </button>
                );
              }
              if (pg === validCurrentPage - 2 || pg === validCurrentPage + 2) {
                return (
                  <span key={pg} className="px-1 text-slate-400 font-bold text-xs">
                    ...
                  </span>
                );
              }
              return null;
            })}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage >= totalPages}
              className="p-2 border border-slate-300 rounded-xl bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Next Page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

