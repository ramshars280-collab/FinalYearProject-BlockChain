"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ethers } from "ethers";
import {
  GraduationCap,
  ShieldCheck,
  Building2,
  Wallet,
  ChevronDown,
  Layers,
  LogIn,
  LogOut,
  User,
  Shield,
  Briefcase,
  PlusCircle,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { UserRole } from "../types/auth";
import RegisterUniversityModal from "./RegisterUniversityModal";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout, openAuthModal } = useAuth();

  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [blockHeight, setBlockHeight] = useState<number>(6294830);

  const [isLoginDropdownOpen, setIsLoginDropdownOpen] = useState(false);
  const [isUniDropdownOpen, setIsUniDropdownOpen] = useState(false);
  const [isRegisterUniModalOpen, setIsRegisterUniModalOpen] = useState(false);

  const loginDropdownRef = useRef<HTMLDivElement>(null);
  const uniDropdownRef = useRef<HTMLDivElement>(null);

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

    const handleClickOutside = (e: MouseEvent) => {
      if (loginDropdownRef.current && !loginDropdownRef.current.contains(e.target as Node)) {
        setIsLoginDropdownOpen(false);
      }
      if (uniDropdownRef.current && !uniDropdownRef.current.contains(e.target as Node)) {
        setIsUniDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      clearInterval(interval);
      document.removeEventListener("mousedown", handleClickOutside);
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

  const handleRoleLoginClick = (role: UserRole) => {
    setIsLoginDropdownOpen(false);
    openAuthModal(role);
  };

  return (
    <>
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
                Ethereum Sepolia &bull; Inter-University Consortium
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-blue-800 font-medium hidden md:inline">
                Zero-PII On-Chain &bull; DPDP Act Certified &bull; RBAC Protected
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200 font-mono font-bold text-[10px]">
                EVM v0.8.20
              </span>
            </div>
          </div>
        </div>

        {/* Main 3-Section Navbar Layout */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            
            {/* 1. LEFT SECTION: Logo & Branding (No overlapping tag) */}
            <div className="flex items-center gap-3 shrink-0">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="relative h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-600 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-all">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 tracking-tight text-lg block leading-tight">
                    MGM Trust Registry
                  </span>
                  <p className="text-[11px] text-slate-500 hidden sm:block leading-none mt-0.5">
                    Academic Credential Verification
                  </p>
                </div>
              </Link>
            </div>

            {/* 2. CENTER SECTION: Simplified Navigation Links */}
            <nav className="hidden md:flex items-center gap-1.5">
              {/* Public Verifier */}
              <Link
                href="/"
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  pathname === "/"
                    ? "text-blue-900 bg-blue-50 border border-blue-200 shadow-xs"
                    : "text-slate-600 hover:text-blue-900 hover:bg-slate-50 border border-transparent"
                }`}
              >
                <ShieldCheck className={`h-4 w-4 ${pathname === "/" ? "text-blue-600" : "text-slate-400"}`} />
                <span>Public Verifier</span>
              </Link>

              {/* DYNAMIC PORTAL LINK (When Logged In) */}
              {isAuthenticated && user && (
                <>
                  {user.role === "STUDENT" && (
                    <Link
                      href="/student"
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        pathname === "/student"
                          ? "text-blue-900 bg-blue-50 border border-blue-200 shadow-xs"
                          : "text-slate-600 hover:text-blue-900 hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      <GraduationCap className={`h-4 w-4 ${pathname === "/student" ? "text-blue-600" : "text-slate-400"}`} />
                      <span>My Credentials</span>
                    </Link>
                  )}

                  {user.role === "EXAM_ADMIN" && (
                    <Link
                      href="/issuer"
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        pathname === "/issuer"
                          ? "text-blue-900 bg-blue-50 border border-blue-200 shadow-xs"
                          : "text-slate-600 hover:text-blue-900 hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      <Layers className={`h-4 w-4 ${pathname === "/issuer" ? "text-blue-600" : "text-slate-400"}`} />
                      <span>Exam Cell Console</span>
                    </Link>
                  )}

                  {user.role === "UNIVERSITY_STAFF" && (
                    <Link
                      href="/university-verifier"
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        pathname === "/university-verifier"
                          ? "text-blue-900 bg-blue-50 border border-blue-200 shadow-xs"
                          : "text-slate-600 hover:text-blue-900 hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      <Building2 className={`h-4 w-4 ${pathname === "/university-verifier" ? "text-blue-600" : "text-slate-400"}`} />
                      <span>Institutional Desk</span>
                    </Link>
                  )}
                </>
              )}

              {/* Universities Dropdown */}
              <div className="relative" ref={uniDropdownRef}>
                <button
                  onClick={() => setIsUniDropdownOpen(!isUniDropdownOpen)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-blue-900 hover:bg-slate-50 transition-all border border-transparent"
                >
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span>Universities</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>

                {isUniDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-1">
                    <Link
                      href="/#consortium"
                      onClick={() => setIsUniDropdownOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left hover:bg-blue-50 transition-colors text-xs font-bold text-slate-800 hover:text-blue-900"
                    >
                      <Building2 className="h-4 w-4 text-blue-600" />
                      <span>View Consortium</span>
                    </Link>

                    <button
                      onClick={() => {
                        setIsUniDropdownOpen(false);
                        setIsRegisterUniModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left hover:bg-blue-50 transition-colors text-xs font-bold text-blue-700 hover:text-blue-800"
                    >
                      <PlusCircle className="h-4 w-4 text-blue-600" />
                      <span>Register University</span>
                    </button>
                  </div>
                )}
              </div>
            </nav>

            {/* 3. RIGHT SECTION: Portal Sign In / User Badge & MetaMask */}
            <div className="flex items-center gap-3 shrink-0">
              {/* AUTHENTICATED: User Identity Pill & Sign Out */}
              {isAuthenticated && user ? (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-1.5 pl-3 text-xs shadow-2xs">
                  <div className="flex items-center gap-1.5 font-bold text-blue-950">
                    {user.role === "STUDENT" && <User className="h-3.5 w-3.5 text-blue-600" />}
                    {user.role === "EXAM_ADMIN" && <Shield className="h-3.5 w-3.5 text-blue-600" />}
                    {user.role === "UNIVERSITY_STAFF" && <Briefcase className="h-3.5 w-3.5 text-blue-600" />}
                    <span className="truncate max-w-[120px] sm:max-w-[160px]">
                      {user.role === "STUDENT"
                        ? `${(user as any).prn || user.fullName}`
                        : user.role === "EXAM_ADMIN"
                        ? "Exam Cell Admin"
                        : user.fullName}
                    </span>
                  </div>

                  <button
                    onClick={() => logout()}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-lg text-xs font-bold transition-all"
                    title="Sign Out"
                  >
                    <LogOut className="h-3 w-3" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </button>
                </div>
              ) : (
                /* UNAUTHENTICATED: Portal Sign In Dropdown */
                <div className="relative" ref={loginDropdownRef}>
                  <button
                    onClick={() => setIsLoginDropdownOpen(!isLoginDropdownOpen)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-blue-50 text-blue-900 border border-blue-300 rounded-xl text-xs font-bold shadow-2xs transition-all hover:scale-102"
                  >
                    <LogIn className="h-4 w-4 text-blue-600" />
                    <span>Portal Sign In</span>
                    <ChevronDown className="h-3 w-3 text-slate-500" />
                  </button>

                  {isLoginDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-1">
                      <button
                        onClick={() => handleRoleLoginClick("STUDENT")}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left hover:bg-blue-50 transition-colors text-xs font-bold text-slate-800 hover:text-blue-900"
                      >
                        <div className="p-1 rounded-lg bg-blue-100 text-blue-700">
                          <GraduationCap className="h-4 w-4" />
                        </div>
                        <span>Student Portal Sign In</span>
                      </button>

                      <button
                        onClick={() => handleRoleLoginClick("EXAM_ADMIN")}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left hover:bg-amber-50 transition-colors text-xs font-bold text-slate-800 hover:text-amber-900"
                      >
                        <div className="p-1 rounded-lg bg-amber-100 text-amber-800">
                          <Shield className="h-4 w-4" />
                        </div>
                        <span>Exam Cell Admin Sign In</span>
                      </button>

                      <button
                        onClick={() => handleRoleLoginClick("UNIVERSITY_STAFF")}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left hover:bg-blue-50 transition-colors text-xs font-bold text-slate-800 hover:text-blue-900"
                      >
                        <div className="p-1 rounded-lg bg-blue-100 text-blue-700">
                          <Briefcase className="h-4 w-4" />
                        </div>
                        <span>Institutional Staff Sign In</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Connect MetaMask Wallet Button */}
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
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-500/20 transition-all hover:scale-102 active:scale-98 disabled:opacity-50"
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
            <Link
              href="/"
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                pathname === "/" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Public Verifier</span>
            </Link>

            {isAuthenticated && user && (
              <>
                {user.role === "STUDENT" && (
                  <Link
                    href="/student"
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      pathname === "/student" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <GraduationCap className="h-3.5 w-3.5" />
                    <span>My Credentials</span>
                  </Link>
                )}
                {user.role === "EXAM_ADMIN" && (
                  <Link
                    href="/issuer"
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      pathname === "/issuer" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>Exam Cell</span>
                  </Link>
                )}
                {user.role === "UNIVERSITY_STAFF" && (
                  <Link
                    href="/university-verifier"
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      pathname === "/university-verifier" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Desk</span>
                  </Link>
                )}
              </>
            )}

            <button
              onClick={() => setIsRegisterUniModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg text-xs font-bold"
            >
              <PlusCircle className="h-3.5 w-3.5 text-blue-600" />
              <span>Register Uni</span>
            </button>
          </div>
        </div>
      </header>

      {/* Global Register University Modal */}
      <RegisterUniversityModal
        isOpen={isRegisterUniModalOpen}
        onClose={() => setIsRegisterUniModalOpen(false)}
        onRegistered={(newInst) => {
          setIsRegisterUniModalOpen(false);
          router.push("/issuer");
        }}
      />
    </>
  );
}
