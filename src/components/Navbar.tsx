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
} from "lucide-react";
import { getSepoliaConfig } from "../lib/storage";

export default function Navbar() {
  const pathname = usePathname();
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);

  useEffect(() => {
    checkWalletConnection();
    if (typeof window !== "undefined" && (window as any).ethereum) {
      (window as any).ethereum.on("accountsChanged", (accounts: string[]) => {
        setAccount(accounts[0] || null);
      });
      (window as any).ethereum.on("chainChanged", (chainHex: string) => {
        setChainId(parseInt(chainHex, 16));
      });
    }
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
        // Fallback simulated student / exam cell wallet
        const mockAddr = "0x71C56538b15294500B73f8472B4fE963D4e58bEf";
        setAccount(mockAddr);
        setChainId(11155111);
        setIsSimulated(true);
      }
    } catch (err: any) {
      console.error("Connection error:", err);
      // fallback
      setAccount("0x71C56538b15294500B73f8472B4fE963D4e58bEf");
      setChainId(11155111);
    } finally {
      setIsConnecting(false);
    }
  };

  const navLinks = [
    { href: "/", label: "Public Verifier", icon: ShieldCheck, badge: "OpenCerts" },
    { href: "/student", label: "Student Portal", icon: UserCheck, badge: "EIP-712" },
    { href: "/issuer", label: "Exam Cell Minting", icon: Layers, badge: "Merkle Batch" },
    { href: "/university-verifier", label: "Institutional Desk", icon: Building2, badge: "NEP 2020 ABC" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-900 via-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 tracking-tight text-lg">MGM Trust Registry</span>
                <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                  Web3
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                DPDP Compliant &bull; NEP 2020 ABC Framework
              </p>
            </div>
          </Link>

          {/* Navigation Items */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-blue-50 text-blue-900 font-semibold shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-blue-700" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Actions: Network Status & Wallet Connect */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Sepolia network badge */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-xs font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Sepolia Testnet</span>
            </div>

            {/* Wallet Button */}
            {account ? (
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-300 rounded-lg p-1 pl-2.5 text-xs text-slate-800 font-mono shadow-xs">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                </div>
                <div className="px-2 py-1 bg-white rounded border border-slate-200 text-slate-600 text-[11px] font-sans font-medium">
                  {isSimulated ? "Demo Signer" : "Connected"}
                </div>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-sm font-medium shadow-sm transition-all hover:shadow hover:-translate-y-0.5 disabled:opacity-50"
              >
                <Wallet className="h-4 w-4" />
                <span>{isConnecting ? "Connecting..." : "Connect Wallet"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation row */}
        <div className="flex md:hidden border-t border-slate-100 py-2 gap-1 overflow-x-auto">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 rounded-md text-xs font-medium ${
                  isActive
                    ? "bg-blue-50 text-blue-900 font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
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
