"use client";

import React, { useState } from "react";
import { X, UserPlus, AlertCircle, CheckCircle2, GraduationCap } from "lucide-react";
import { StudentDegreeData } from "../types";

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount: number;
  institutionName?: string;
  institutionCode?: string;
  onAddStudent: (student: StudentDegreeData, replaceAll: boolean) => void;
  existingPrns: string[];
}

const COMMON_BRANCHES = [
  "Computer Science & Engineering",
  "Artificial Intelligence & Data Science",
  "Information Technology",
  "IoT & Cyber Security Including Blockchain",
  "Electronics & Computer Engineering",
  "Robotics & Automation",
  "Mechanical Engineering",
  "Civil Engineering",
];

const COMMON_DEGREES = [
  "Bachelor of Technology",
  "Master of Technology",
  "Bachelor of Science",
  "Master of Science",
  "Bachelor of Engineering",
];

export default function AddStudentModal({
  isOpen,
  onClose,
  currentCount,
  institutionName = "MGM University, Chhatrapati Sambhajinagar",
  institutionCode = "MGMU-ENG-01",
  onAddStudent,
  existingPrns,
}: AddStudentModalProps) {
  const [prn, setPrn] = useState("");
  const [fullName, setFullName] = useState("");
  const [degree, setDegree] = useState("Bachelor of Technology");
  const [branch, setBranch] = useState("Computer Science & Engineering");
  const [customBranch, setCustomBranch] = useState("");
  const [cgpa, setCgpa] = useState("8.50");
  const [graduationYear, setGraduationYear] = useState("2024");
  const [nheqfCredits, setNheqfCredits] = useState("160");
  const [nheqfLevel, setNheqfLevel] = useState("6.0");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPrn = prn.trim().toUpperCase();
    if (!cleanPrn) {
      setError("Permanent Registration Number (PRN) is required.");
      return;
    }
    if (!/^[A-Z0-9_\-\/]{2,40}$/i.test(cleanPrn)) {
      setError("PRN must be alphanumeric (2 to 40 characters).");
      return;
    }

    if (mode === "append" && existingPrns.map((p) => p.toUpperCase()).includes(cleanPrn)) {
      setError(`PRN "${cleanPrn}" is already present in the current staged batch.`);
      return;
    }

    const cleanName = fullName.trim();
    if (!cleanName || cleanName.length < 2) {
      setError("Student full name must be at least 2 characters.");
      return;
    }

    const parsedCgpa = parseFloat(cgpa);
    if (isNaN(parsedCgpa) || parsedCgpa < 0 || parsedCgpa > 10) {
      setError("CGPA must be a valid number between 0.00 and 10.00.");
      return;
    }

    const parsedYear = parseInt(graduationYear, 10);
    if (isNaN(parsedYear) || parsedYear < 1950 || parsedYear > 2100) {
      setError("Graduation year must be between 1950 and 2100.");
      return;
    }

    const finalBranch = branch === "Other" ? customBranch.trim() : branch;
    if (!finalBranch) {
      setError("Branch / Department cannot be empty.");
      return;
    }

    let division = "First Class";
    if (parsedCgpa >= 8.5) division = "First Class with Distinction";
    else if (parsedCgpa >= 6.75) division = "First Class";
    else if (parsedCgpa >= 5.75) division = "Higher Second Class";
    else division = "Pass Class";

    const newStudent: StudentDegreeData = {
      prn: cleanPrn,
      fullName: cleanName,
      degree,
      branch: finalBranch,
      cgpa: Number(parsedCgpa.toFixed(2)),
      graduationYear: parsedYear,
      issueDate: new Date().toISOString().split("T")[0],
      nheqfCredits: parseInt(nheqfCredits, 10) || 160,
      nheqfLevel: parseFloat(nheqfLevel) || 6.0,
      university: institutionName,
      institutionCode,
      division,
    };

    onAddStudent(newStudent, mode === "replace");

    // Reset inputs
    setPrn("");
    setFullName("");
    setCgpa("8.50");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 sm:p-7 relative text-slate-900">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4 mb-5">
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-600 rounded-2xl shrink-0">
            <UserPlus className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Manual Student Entry</span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold uppercase rounded-md">
                Admin Console
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Add individual student degree credentials directly to the cryptographic staging batch.
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-xs text-red-800 font-semibold animate-in fade-in duration-200">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Mode Selector */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
            <span className="text-[11px] font-bold text-slate-700 block">Batch Insertion Mode:</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("append")}
                className={`py-2 px-3 rounded-xl font-bold transition-all border text-left flex flex-col gap-0.5 ${
                  mode === "append"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                }`}
              >
                <span>Append to Batch</span>
                <span className={`text-[10px] font-normal ${mode === "append" ? "text-blue-100" : "text-slate-500"}`}>
                  Add to current {currentCount} student{currentCount !== 1 ? "s" : ""}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMode("replace")}
                className={`py-2 px-3 rounded-xl font-bold transition-all border text-left flex flex-col gap-0.5 ${
                  mode === "replace"
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                }`}
              >
                <span>Start New Batch</span>
                <span className={`text-[10px] font-normal ${mode === "replace" ? "text-blue-100" : "text-slate-500"}`}>
                  Single candidate batch
                </span>
              </button>
            </div>
          </div>

            {/* PRN and Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Student PRN / Roll No <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={prn}
                  onChange={(e) => setPrn(e.target.value.toUpperCase())}
                  placeholder="e.g. PRN20240101"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
                  required
                />
              </div>
            </div>

            {/* Degree and Branch */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Degree Program</label>
                <select
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
                >
                  {COMMON_DEGREES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Department / Branch</label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
                >
                  {COMMON_BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  <option value="Other">Other (Custom Specialization)</option>
                </select>
              </div>
            </div>

            {branch === "Other" && (
              <div>
                <label className="block text-slate-700 font-bold mb-1">Custom Branch Name</label>
                <input
                  type="text"
                  value={customBranch}
                  onChange={(e) => setCustomBranch(e.target.value)}
                  placeholder="Enter exact specialization / branch"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
                  required
                />
              </div>
            )}

            {/* CGPA and Year */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  CGPA (0 - 10) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={cgpa}
                  onChange={(e) => setCgpa(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-mono font-bold text-blue-700 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Graduation Year</label>
                <input
                  type="number"
                  min="1950"
                  max="2100"
                  value={graduationYear}
                  onChange={(e) => setGraduationYear(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-mono font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">NHEQF Credits</label>
                <input
                  type="number"
                  value={nheqfCredits}
                  onChange={(e) => setNheqfCredits(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-mono font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
                />
              </div>
            </div>

            {/* University context preview */}
            <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-2xl text-[11px] text-blue-900 flex items-center justify-between">
              <span className="font-semibold text-blue-800">Anchoring Authority:</span>
              <span className="font-bold truncate max-w-[240px]">{institutionName}</span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all hover:scale-101 active:scale-99 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{mode === "replace" ? "Set as Single Batch" : "Add to Batch"}</span>
              </button>
            </div>
          </form>
      </div>
    </div>
  );
}

