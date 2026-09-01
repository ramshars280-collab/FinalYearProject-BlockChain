"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ethers } from "ethers";
import {
  GraduationCap,
  ShieldCheck,
  Building2,
  UserCheck,
  Wallet,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  Layers,
  Sparkles,
  Activity,
  Copy,
  Check,
  Cpu,
} from "lucide-react";
import { getSepoliaConfig } from "../lib/storage";

export default function Navbar() {
  const pathname = usePathname();
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [blockHeight, setBlockHeight] = useState<number>(6294830);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkWalletConnection();

    // Simulated block ticker
    const interval = setInterval(() => {
      setBlockHeight((prev) => prev + 1);
    }, 12000);

    if (typeof window !== "undefined" && (window as any).ethereum) {
      (window as any).ethereum.on("accountsChanged", (accounts: string[]) => {
        setAccount(accounts[0] || null);
      });
      (window as any).ethereum.on("chainChanged", (chainHex: string) => {
        setChainId(parseInt(chainHex, 16));
      });
    }

    return () => clearInterval(interval);
  }, []);

  const checkWalletConnection = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          setAccount(accounts[0].address);
          const network = await provider.getNetwork();
          setChainId(Number(network.chainId));
        }
      } catch (e) {
        console.error("Wallet check error:", e);
      }
    }
  };

  const connectWallet = async () => {
    if (typeof window === "undefined") return;
    setIsConnecting(true);
    try {
      if ((window as any).ethereum) {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        if (accounts && accounts[0]) {
          setAccount(accounts[0]);
          const network = await provider.getNetwork();
          setChainId(Number(network.chainId));
        }
      } else {
        const mockAddr = "0x71C56538b15294500B73f8472B4fE963D4e58bEf";
        setAccount(mockAddr);
        setChainId(11155111);
        setIsSimulated(true);
      }
    } catch (err: any) {
      console.error("Connection error:", err);
      setAccount("0x71C56538b15294500B73f8472B4fE963D4e58bEf");
      setChainId(11155111);
      setIsSimulated(true);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const navLinks = [
    { href: "/", label: "Public Verifier", icon: ShieldCheck, badge: "OpenCerts" },
    { href: "/student", label: "Student Portal", icon: UserCheck, badge: "EIP-712" },
    { href: "/issuer", label: "Exam Cell Minting", icon: Layers, badge: "Merkle Batch" },
    { href: "/university-verifier", label: "Institutional Desk", icon: Building2, badge: "NEP 2020 ABC" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
      {/* Top micro ticker */}
      <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-1 text-[11px] text-blue-900">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-blue-800 font-mono font-semibold">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              <span>Sepolia Block #{blockHeight.toLocaleString()}</span>
            </span>
            <span className="hidden sm:inline text-blue-300">&bull;</span>
            <span className="hidden sm:inline text-blue-700">
              Contract: <span className="font-mono text-blue-900 font-bold">0x89205A...43e7</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-blue-800 font-medium hidden md:inline">
              Zero-PII On-Chain &bull; DPDP Act Certified
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200 font-mono font-bold text-[10px]">
              EVM v0.8.20
            </span>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-600 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-all">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 tracking-tight text-lg">
                  MGM Trust Registry
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-100 border border-blue-200 text-blue-800 rounded-full">
                  Verified
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Academic Credential Verification &amp; Dual-Role Desk
              </p>
            </div>
          </Link>

          {/* Navigation Items */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all relative ${
                    isActive
                      ? "text-blue-900 bg-blue-50 border border-blue-200 shadow-xs"
                      : "text-slate-600 hover:text-blue-900 hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-600 rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Actions: Network Status & Wallet Connect */}
          <div className="flex items-center gap-3">
            {/* Wallet Button */}
            {account ? (
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1.5 pl-3 text-xs text-slate-800 font-mono shadow-xs">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                </div>
                <button
                  onClick={() => handleCopy(account)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Copy Wallet Address"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                </button>
                <div className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-800 rounded text-[10px] font-sans font-bold">
                  {isSimulated ? "Demo Signer" : "Sepolia"}
                </div>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-500/20 transition-all hover:scale-102 active:scale-98 disabled:opacity-50"
              >
                <Wallet className="h-4 w-4" />
                <span>{isConnecting ? "Connecting..." : "Connect MetaMask"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation row */}
        <div className="flex lg:hidden border-t border-slate-200 py-2.5 gap-1.5 overflow-x-auto">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
