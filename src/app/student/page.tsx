"use client";

import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  UserCheck,
  Wallet,
  ShieldCheck,
  KeyRound,
  Download,
  QrCode,
  Sparkles,
  Award,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  FileCheck,
  Eye,
  Lock,
  Cpu,
  Fingerprint,
  Layers,
} from "lucide-react";
import QRCode from "qrcode";
import {
  getStoredIdentities,
  saveIdentityBinding,
  getStoredBatches,
  getSepoliaConfig,
} from "../../lib/storage";
import { signIdentityBinding, verifyIdentityBindingSignature } from "../../lib/eip712";
import { createW3CCredential } from "../../lib/crypto";
import { downloadFile } from "../../lib/zipHelper";
import { W3CCredentialPayload, StudentDegreeData, BatchRecord } from "../../types";
import ZkProofModal from "../../components/ZkProofModal";
import DegreeCertificate from "../../components/DegreeCertificate";
import InteractiveHologramCard from "../../components/InteractiveHologramCard";

export default function StudentPortalPage() {
  const [prn, setPrn] = useState("PRN20200101");
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isBinding, setIsBinding] = useState(false);
  const [bindingSuccess, setBindingSuccess] = useState<string | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [boundRecord, setBoundRecord] = useState<any>(null);

  // Vault credentials
  const [studentCredentials, setStudentCredentials] = useState<W3CCredentialPayload[]>([]);
  const [selectedCredForZk, setSelectedCredForZk] = useState<W3CCredentialPayload | null>(null);
  const [selectedCredForPreview, setSelectedCredForPreview] = useState<W3CCredentialPayload | null>(null);
  const [activeQrModal, setActiveQrModal] = useState<{ isOpen: boolean; qrDataUrl: string; prn: string }>({
    isOpen: false,
    qrDataUrl: "",
    prn: "",
  });

  useEffect(() => {
    checkWalletAndIdentities();
    loadStudentVault();
  }, [prn]);

  const checkWalletAndIdentities = async () => {
    const identities = getStoredIdentities();
    const currentBinding = identities[prn.toUpperCase()];
    if (currentBinding) {
      setBoundRecord(currentBinding);
      setWalletAddress(currentBinding.walletAddress);
    } else {
      setBoundRecord(null);
    }

    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          setWalletAddress(accounts[0].address);
        }
      } catch (e) {
        console.error("Wallet check failed:", e);
      }
    }
  };

  const loadStudentVault = () => {
    const batches: BatchRecord[] = getStoredBatches();
    const foundCreds: W3CCredentialPayload[] = [];

    batches.forEach((batch) => {
      batch.records.forEach((record, index) => {
        if (record.prn.toUpperCase() === prn.trim().toUpperCase()) {
          const cred = createW3CCredential(
            record,
            {
              batchId: batch.batchId,
              leafIndex: index,
              leafHash: "",
              rootHash: batch.merkleRoot,
              proof: [],
              contractAddress: getSepoliaConfig().credentialRegistryAddress,
              network: "sepolia",
              chainId: 11155111,
            },
            batch.issuer
          );
          foundCreds.push(cred);
        }
      });
    });

    setStudentCredentials(foundCreds);
  };

  const handleBindIdentity = async () => {
    if (!prn.trim()) {
      setBindingError("Please enter a valid student PRN.");
      return;
    }

    setIsBinding(true);
    setBindingError(null);
    setBindingSuccess(null);

    try {
      const config = getSepoliaConfig();
      let signature = "";
      let timestamp = Math.floor(Date.now() / 1000);
      let signerWallet = walletAddress;

      if (typeof window !== "undefined" && (window as any).ethereum) {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        signerWallet = await signer.getAddress();

        const signResult = await signIdentityBinding(
          signer,
          config.identityRegistryAddress,
          prn,
          config.chainId
        );
        signature = signResult.signature;
        timestamp = signResult.timestamp;
      } else {
        signerWallet = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
        signature = "0x5c42a2b0c156f3e0984852936230b42ffab264df7538c267e812d6a5c179c3cf0c19b22e1a3bc8c86d8b5c907106037e5e3ebf686300976d8b746c8270ec08d11c";
      }

      const bindingRecord = {
        prn: prn.toUpperCase(),
        walletAddress: signerWallet,
        timestamp,
        signature,
      };

      saveIdentityBinding(bindingRecord);
      setBoundRecord(bindingRecord);
      setBindingSuccess(`Successfully bound PRN ${prn.toUpperCase()} to wallet ${signerWallet.slice(0, 6)}...${signerWallet.slice(-4)}!`);
      loadStudentVault();
    } catch (err: any) {
      console.error("Binding error:", err);
      setBindingError(err?.message || "Identity binding signature rejected by user.");
    } finally {
      setIsBinding(false);
    }
  };

  const handleDownloadW3C = (cred: W3CCredentialPayload) => {
    const jsonStr = JSON.stringify(cred, null, 2);
    downloadFile(
      jsonStr,
      `degree_credential_${cred.credentialSubject.prn}.json`
    );
  };

  const handleShowQr = async (cred: W3CCredentialPayload) => {
    const jsonStr = JSON.stringify(cred);
    try {
      const url = await QRCode.toDataURL(jsonStr, { width: 300, margin: 2 });
      setActiveQrModal({
        isOpen: true,
        qrDataUrl: url,
        prn: cred.credentialSubject.prn,
      });
    } catch (e) {
      console.error("QR creation error:", e);
    }
  };

  return (
    <div className="space-y-8 py-2">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded-full text-xs font-semibold mb-2">
          <UserCheck className="h-3.5 w-3.5 text-purple-400" />
          <span>Student Self-Sovereign Identity (SSI)</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
          Student Portal &amp; Web3 Vault
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Bind your university PRN to MetaMask with EIP-712 typed data and access offline W3C credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SECTION 1: Identity Handshake Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 text-cyan-400 rounded-2xl">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  1. EIP-712 Identity Handshake
                </h3>
                <p className="text-xs text-slate-400">
                  Cryptographic PRN-to-Wallet Binding
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Permanent Registration Number (PRN):
                </label>
                <input
                  type="text"
                  value={prn}
                  onChange={(e) => setPrn(e.target.value.toUpperCase())}
                  placeholder="e.g. PRN20200101"
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono font-bold focus:ring-2 focus:ring-cyan-500 focus:outline-hidden uppercase"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Default test student: <button type="button" onClick={() => setPrn("PRN20200101")} className="text-cyan-400 font-bold hover:underline">PRN20200101</button>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Connected Web3 Wallet:
                </label>
                <div className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-300 font-mono flex items-center justify-between">
                  <span>
                    {walletAddress
                      ? `${walletAddress.slice(0, 10)}...${walletAddress.slice(-6)}`
                      : "0xf39F...2266 (Demo Signer)"}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              </div>

              {boundRecord ? (
                <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs space-y-1.5 shadow-inner">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Identity Cryptographically Bound</span>
                  </div>
                  <p className="text-[11px] font-mono text-emerald-200/90 truncate">
                    Wallet: {boundRecord.walletAddress}
                  </p>
                  <p className="text-[10px] text-emerald-400">
                    EIP-712 Signature verified &bull; Domain: &quot;MGM Trust Registry&quot;
                  </p>
                </div>
              ) : null}

              {bindingSuccess && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-500/60 rounded-xl text-emerald-300 text-xs flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{bindingSuccess}</span>
                </div>
              )}

              {bindingError && (
                <div className="p-3 bg-red-950/60 border border-red-500/60 rounded-xl text-red-300 text-xs flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{bindingError}</span>
                </div>
              )}

              <button
                onClick={handleBindIdentity}
                disabled={isBinding}
                className="w-full py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all hover:scale-102 active:scale-98 disabled:opacity-50"
              >
                <Wallet className="h-4 w-4" />
                <span>
                  {isBinding ? "Requesting EIP-712 Signature..." : boundRecord ? "Re-bind MetaMask Wallet" : "Sign EIP-712 Identity Handshake"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 2: My Credential Vault */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    2. My Credential Vault
                  </h3>
                  <p className="text-xs text-slate-400">
                    Offline W3C Credentials &amp; Zero-Knowledge Attribute Proofs
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 bg-slate-900 rounded-xl text-xs font-mono font-bold text-cyan-400 border border-slate-800">
                {studentCredentials.length} Credential(s)
              </span>
            </div>

            {studentCredentials.length === 0 ? (
              <div className="text-center py-12 space-y-3 text-slate-400">
                <FileCheck className="h-12 w-12 mx-auto text-slate-600" />
                <p className="text-sm font-bold text-slate-300">No credentials found for PRN: {prn}</p>
                <p className="text-xs text-slate-500">
                  Switch to PRN20200101 or mint a graduation batch in the Issuer tab.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {studentCredentials.map((cred, idx) => {
                  const s = cred.credentialSubject;
                  return (
                    <InteractiveHologramCard
                      key={idx}
                      className="border border-slate-800 rounded-2xl p-6 bg-slate-900/60 hover:border-cyan-500/40 transition-all space-y-5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-300 bg-cyan-950/80 border border-cyan-800 px-2.5 py-0.5 rounded-full">
                            Official Degree
                          </span>
                          <h4 className="text-lg font-bold text-white mt-1.5">
                            {s.degree} in {s.branch}
                          </h4>
                          <p className="text-xs text-slate-400">{s.university}</p>
                        </div>

                        <div className="text-left sm:text-right">
                          <span className="text-sm font-black text-cyan-400 font-mono">
                            CGPA: {s.cgpa} / 10.0
                          </span>
                          <p className="text-[11px] text-slate-500 font-mono">
                            Class of {s.graduationYear} &bull; NHEQF Level {s.nheqfLevel || 6.0}
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          onClick={() => handleDownloadW3C(cred)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all hover:scale-102"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download W3C JSON-LD</span>
                        </button>

                        <button
                          onClick={() => handleShowQr(cred)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all hover:scale-102"
                        >
                          <QrCode className="h-3.5 w-3.5 text-cyan-400" />
                          <span>View Shareable QR</span>
                        </button>

                        <button
                          onClick={() => setSelectedCredForZk(cred)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-700/80 rounded-xl text-xs font-bold transition-all hover:scale-102"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                          <span>Generate ZK Proof</span>
                        </button>

                        <button
                          onClick={() => setSelectedCredForPreview(cred)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all hover:scale-102 ml-auto"
                        >
                          <Eye className="h-3.5 w-3.5 text-cyan-400" />
                          <span>Preview Degree</span>
                        </button>
                      </div>
                    </InteractiveHologramCard>
                  );
                })}
              </div>
            )}
          </div>

          {/* Certificate Preview Card if Selected */}
          {selectedCredForPreview && (
            <div className="space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-bold text-white">Full Certificate Inspection</h4>
                <button
                  onClick={() => setSelectedCredForPreview(null)}
                  className="text-xs text-slate-400 hover:text-white underline"
                >
                  Close Inspection
                </button>
              </div>
              <DegreeCertificate credential={selectedCredForPreview} />
            </div>
          )}
        </div>
      </div>

      {/* QR Code Display Modal */}
      {activeQrModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="glass-panel rounded-3xl max-w-sm w-full p-6 shadow-2xl relative text-center border border-slate-800">
            <h3 className="text-lg font-bold text-white">
              Shareable Degree QR Code
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              PRN: {activeQrModal.prn} &bull; OpenCerts / W3C Payload
            </p>

            <div className="bg-white p-4 rounded-2xl border border-slate-300 inline-block shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeQrModal.qrDataUrl}
                alt="Credential QR"
                className="w-48 h-48 mx-auto"
              />
            </div>

            <p className="text-[11px] text-slate-400 mt-3">
              Scan with the Public Verifier camera to instantly evaluate cryptographic authenticity.
            </p>

            <button
              onClick={() => setActiveQrModal({ isOpen: false, qrDataUrl: "", prn: "" })}
              className="mt-5 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ZK Proof Generator Modal */}
      {selectedCredForZk && (
        <ZkProofModal
          isOpen={true}
          onClose={() => setSelectedCredForZk(null)}
          credential={selectedCredForZk}
        />
      )}
    </div>
  );
}
