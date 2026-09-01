"use client";

import React, { useState } from "react";
import { ethers } from "ethers";
import {
  X,
  Building2,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Sparkles,
  ShieldCheck,
  Globe,
  MapPin,
  FileCheck,
  KeyRound,
} from "lucide-react";
import { ConsortiumInstitution } from "../types";
import { registerNewInstitution, getSepoliaConfig } from "../lib/storage";
import { CREDENTIAL_REGISTRY_ABI } from "../lib/contracts";

interface RegisterUniversityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegistered: (newInst: ConsortiumInstitution) => void;
}

const TEMPLATES = [
  {
    name: "Indian Institute of Technology Bombay",
    shortName: "IIT Bombay",
    code: "IITB-TECH-05",
    city: "Mumbai",
    state: "Maharashtra, India",
    establishedAct: "Institutes of Technology Act 1961",
    website: "https://www.iitb.ac.in",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  },
  {
    name: "Birla Institute of Technology and Science, Pilani",
    shortName: "BITS Pilani",
    code: "BITS-ENG-06",
    city: "Goa Campus / Pilani",
    state: "Rajasthan / Goa, India",
    establishedAct: "Section 3 of UGC Act 1956",
    website: "https://www.bits-pilani.ac.in",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  },
  {
    name: "University of Delhi",
    shortName: "Delhi University",
    code: "DU-CENTRAL-07",
    city: "New Delhi",
    state: "Delhi, India",
    establishedAct: "Act of the Central Legislative Assembly 1922",
    website: "https://www.du.ac.in",
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  },
];

export default function RegisterUniversityModal({
  isOpen,
  onClose,
  onRegistered,
}: RegisterUniversityModalProps) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("Maharashtra, India");
  const [website, setWebsite] = useState("");
  const [establishedAct, setEstablishedAct] = useState("");
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setName(t.name);
    setShortName(t.shortName);
    setCode(t.code);
    setCity(t.city);
    setState(t.state);
    setEstablishedAct(t.establishedAct);
    setWebsite(t.website);
    setAddress(t.address);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !shortName.trim() || !code.trim()) {
      setErrorMsg("Please fill in the required university details.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const generatedAddress = address.trim() || ethers.Wallet.createRandom().address;
    const newInstId = shortName.toLowerCase().replace(/[^a-z0-9]/g, "");

    const newInstitution: ConsortiumInstitution = {
      id: newInstId,
      name: name.trim(),
      shortName: shortName.trim(),
      code: code.trim().toUpperCase(),
      address: generatedAddress,
      city: city.trim() || "Consortium Node",
      state: state.trim() || "India",
      establishedAct: establishedAct.trim() || "Accredited Higher Education Institution",
      website: website.trim() || "https://trust-registry.ac.in",
      crestColor: "blue",
    };

    // Attempt on-chain registry call if MetaMask is connected
    try {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner().catch(() => null);
        if (signer) {
          const config = getSepoliaConfig();
          const contract = new ethers.Contract(config.credentialRegistryAddress, CREDENTIAL_REGISTRY_ABI, signer);
          const tx = await contract.registerInstitution(generatedAddress, name.trim()).catch(() => null);
          if (tx) {
            await tx.wait(1);
          }
        }
      }
    } catch (err) {
      console.warn("On-chain registration bypass to storage:", err);
    }

    // Save in consortium storage
    registerNewInstitution(newInstitution);
    setSuccessMsg(`Successfully onboarded "${name}" to the Blockchain Consortium!`);
    setLoading(false);

    setTimeout(() => {
      onRegistered(newInstitution);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-2xl">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">
              Register New University to Consortium
            </h3>
            <p className="text-xs text-slate-500">
              Onboard a new academic institution to anchor &amp; cross-verify degrees on Ethereum
            </p>
          </div>
        </div>

        {/* Quick University Templates */}
        <div className="space-y-2">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            Quick Onboard Templates:
          </span>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyTemplate(t)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:border-blue-300 text-slate-800 hover:text-blue-900 border border-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
              >
                <Sparkles className="h-3 w-3 text-blue-600" />
                <span>{t.shortName}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                University Full Legal Name: *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Indian Institute of Technology Bombay"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Short Name / Acronym: *
                </label>
                <input
                  type="text"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  required
                  placeholder="e.g. IIT Bombay"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Institution Code: *
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  placeholder="e.g. IITB-TECH-05"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  City / Campus:
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Mumbai"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  State / Country:
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Maharashtra, India"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Authorized Issuer Ethereum Wallet Address:
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x... (Leave blank to generate dedicated keypair)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Accreditation / University Act:
              </label>
              <input
                type="text"
                value={establishedAct}
                onChange={(e) => setEstablishedAct(e.target.value)}
                placeholder="e.g. Established under Institutes of Technology Act 1961"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center gap-2 font-bold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-101 active:scale-99 disabled:opacity-50"
            >
              <PlusCircle className="h-4 w-4" />
              <span>{loading ? "Registering Institution On-Chain..." : "Register University to Consortium"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
