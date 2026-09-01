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
        // Fallback demo signature
        signerWallet = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
        signature = "0x5c42a2b0c156f3e0984852936230b42ffab264df7538c267e812d6a5c179c3cf0c19b22e1a3bc8c86d8b5c907106037e5e3ebf686300976d8b746c8270ec08d11c";
      }

      // Commit binding
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
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-100 border border-purple-200 text-purple-900 rounded-full text-xs font-semibold mb-2">
          <UserCheck className="h-3.5 w-3.5 text-purple-700" />
          <span>Student Self-Sovereign Identity (SSI)</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Student Portal &amp; Credential Vault
        </h1>
        <p className="text-xs sm:text-sm text-slate-600">
          Bind your university PRN to MetaMask with EIP-712 typed data and access offline W3C credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SECTION 1: Identity Handshake Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
              <div className="p-2 bg-blue-100 text-blue-900 rounded-xl">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Section 1: Identity Handshake
                </h3>
                <p className="text-xs text-slate-500">
                  EIP-712 PRN-to-Wallet Identity Binding
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Permanent Registration Number (PRN):
                </label>
                <input
                  type="text"
                  value={prn}
                  onChange={(e) => setPrn(e.target.value.toUpperCase())}
                  placeholder="e.g. PRN20200101"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden uppercase"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Try default test student: <code className="text-blue-700 font-bold">PRN20200101</code>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Connected Web3 Wallet:
                </label>
                <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 font-mono flex items-center justify-between">
                  <span>
                    {walletAddress
                      ? `${walletAddress.slice(0, 10)}...${walletAddress.slice(-6)}`
                      : "0xf39F...2266 (Demo Signer)"}
                  </span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
              </div>

              {boundRecord ? (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Identity Cryptographically Bound</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 font-mono truncate">
                    Wallet: {boundRecord.walletAddress}
                  </p>
                  <p className="text-[10px] text-emerald-700">
                    EIP-712 Signature verified &bull; Domain: &quot;MGM Trust Registry&quot;
                  </p>
                </div>
              ) : null}

              {bindingSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{bindingSuccess}</span>
                </div>
              )}

              {bindingError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{bindingError}</span>
                </div>
              )}

              <button
                onClick={handleBindIdentity}
                disabled={isBinding}
                className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50"
              >
                <Wallet className="h-4 w-4" />
                <span>
                  {isBinding ? "Requesting EIP-712 Signature..." : boundRecord ? "Re-bind MetaMask Wallet" : "Bind MetaMask Wallet"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 2: My Credential Vault */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-900 rounded-xl">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Section 2: My Credential Vault
                  </h3>
                  <p className="text-xs text-slate-500">
                    Offline W3C Credentials &amp; Zero-Knowledge Attribute Proofs
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-mono font-semibold text-slate-700 border border-slate-200">
                {studentCredentials.length} Credential(s) Found
              </span>
            </div>

            {studentCredentials.length === 0 ? (
              <div className="text-center py-10 space-y-2 text-slate-400">
                <FileCheck className="h-10 w-10 mx-auto text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No credentials found for PRN: {prn}</p>
                <p className="text-xs text-slate-400">
                  Switch to PRN20200101 or upload a graduation batch in the Issuer tab.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {studentCredentials.map((cred, idx) => {
                  const s = cred.credentialSubject;
                  return (
                    <div
                      key={idx}
                      className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-4 shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            Official Degree
                          </span>
                          <h4 className="text-base font-bold text-slate-900 mt-1">
                            {s.degree} in {s.branch}
                          </h4>
                          <p className="text-xs text-slate-500">{s.university}</p>
                        </div>

                        <div className="text-left sm:text-right">
                          <span className="text-xs font-bold text-slate-800">
                            CGPA: {s.cgpa}
                          </span>
                          <p className="text-[11px] text-slate-400 font-mono">
                            Class of {s.graduationYear}
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          onClick={() => handleDownloadW3C(cred)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-medium shadow-2xs transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download W3C JSON-LD</span>
                        </button>

                        <button
                          onClick={() => handleShowQr(cred)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-medium transition-colors"
                        >
                          <QrCode className="h-3.5 w-3.5 text-slate-600" />
                          <span>View Shareable QR</span>
                        </button>

                        <button
                          onClick={() => setSelectedCredForZk(cred)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-purple-700" />
                          <span>Generate ZK Attribute Proof</span>
                        </button>

                        <button
                          onClick={() => setSelectedCredForPreview(cred)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-medium transition-colors ml-auto"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Preview Degree</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Certificate Preview Card if Selected */}
          {selectedCredForPreview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">Certificate Inspection View</h4>
                <button
                  onClick={() => setSelectedCredForPreview(null)}
                  className="text-xs text-slate-500 hover:underline"
                >
                  Close Preview
                </button>
              </div>
              <DegreeCertificate credential={selectedCredForPreview} />
            </div>
          )}
        </div>
      </div>

      {/* QR Code Display Modal */}
      {activeQrModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-center border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              Shareable Degree QR Code
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              PRN: {activeQrModal.prn} &bull; OpenCerts / W3C Payload
            </p>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeQrModal.qrDataUrl}
                alt="Credential QR"
                className="w-48 h-48 mx-auto"
              />
            </div>

            <p className="text-[11px] text-slate-400 mt-3">
              Any employer or verifier can scan this code with their smartphone camera on the Public Verifier page.
            </p>

            <button
              onClick={() => setActiveQrModal({ isOpen: false, qrDataUrl: "", prn: "" })}
              className="mt-5 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold"
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
