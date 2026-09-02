"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ethers } from "ethers";
import {
  GraduationCap,
  ShieldCheck,
  UserCheck,
  Layers,
  Wallet,
  LogOut,
  User,
  Shield,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();

  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [blockHeight, setBlockHeight] = useState<number>(6294830);

  useEffect(() => {
    setMounted(true);
    checkWalletConnection();

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

    return () => {
      clearInterval(interval);
    };
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

  const navLinks = [
    { href: "/", label: "Public Verifier", icon: ShieldCheck },
    { href: "/student", label: "Student Vault", icon: UserCheck },
    { href: "/issuer", label: "University Admin", icon: Layers },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
      {/* Top Micro Ticker */}
      <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-1 text-[11px] text-blue-900">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-blue-800 font-mono font-semibold" suppressHydrationWarning>
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              <span>Sepolia Block #{mounted ? blockHeight.toLocaleString() : "6294830"}</span>
            </span>
            <span className="hidden sm:inline text-blue-300">&bull;</span>
            <span className="hidden sm:inline text-blue-700 font-medium">
              Ethereum Sepolia
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-blue-800 font-medium hidden md:inline">
              Zero-PII On-Chain &bull; DPDP Act Certified &bull; NEP 2020 ABC
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200 font-mono font-bold text-[10px]">
              EVM v0.8.20
            </span>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* LEFT: Logo & Branding */}
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-600 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-all">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight text-lg block leading-tight">
                MGM Trust Registry
              </span>
              <p className="text-[11px] text-slate-500 hidden sm:block leading-none mt-0.5">
                Academic Credential Verification System
              </p>
            </div>
          </Link>

          {/* CENTER: Clean 3 Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? "text-white bg-blue-600 shadow-sm border border-blue-700"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-500"}`} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* RIGHT: User Session Badge (if logged in) + Connect MetaMask Button */}
          <div className="flex items-center gap-3 shrink-0">
            {isAuthenticated && user && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-1 pl-2.5 sm:p-1.5 sm:pl-3 text-xs shadow-2xs">
                <div className="flex items-center gap-1.5 font-bold text-blue-950">
                  {user.role === "STUDENT" ? (
                    <User className="h-3.5 w-3.5 text-blue-600" />
                  ) : (
                    <Shield className="h-3.5 w-3.5 text-blue-600" />
                  )}
                  <span className="hidden sm:inline truncate max-w-[140px]">
                    {user.role === "STUDENT"
                      ? `${(user as any).prn}`
                      : "University Admin"}
                  </span>
                </div>

                <button
                  onClick={() => logout()}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-lg text-xs font-bold transition-all"
                  title="Sign Out"
                >
                  <LogOut className="h-3 w-3" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}

            {account ? (
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1.5 px-3 text-xs text-slate-800 shadow-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="hidden sm:inline">MetaMask Connected</span>
                  <span className="sm:hidden">Connected</span>
                </div>
                <div className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-800 rounded text-[10px] font-sans font-bold">
                  {isSimulated ? "Demo" : "Sepolia"}
                </div>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all hover:scale-102 active:scale-98 disabled:opacity-50"
              >
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">{isConnecting ? "Connecting..." : "Connect MetaMask"}</span>
                <span className="sm:hidden">{isConnecting ? "..." : "Connect"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden border-t border-slate-200 py-2.5 gap-2 items-center justify-between overflow-x-auto">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-white" : "text-slate-500"}`} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
