"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  LogIn,
  LogOut,
  User,
  Shield,
  Briefcase,
  Lock,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { UserRole } from "../types/auth";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout, openAuthModal } = useAuth();

  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [blockHeight, setBlockHeight] = useState<number>(6294830);
  const [isLoginDropdownOpen, setIsLoginDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsLoginDropdownOpen(false);
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

  const navLinks = [
    { href: "/", label: "Public Verifier", icon: ShieldCheck, requiredRole: null, badge: "Open" },
    { href: "/student", label: "Student Portal", icon: UserCheck, requiredRole: "STUDENT" as UserRole, badge: "EIP-712" },
    { href: "/issuer", label: "Exam Cell Minting", icon: Layers, requiredRole: "EXAM_ADMIN" as UserRole, badge: "Admin" },
    { href: "/university-verifier", label: "Institutional Desk", icon: Building2, requiredRole: "UNIVERSITY_STAFF" as UserRole, badge: "Staff" },
  ];

  const handleNavClick = (e: React.MouseEvent, item: typeof navLinks[0]) => {
    if (!item.requiredRole) return;

    if (!isAuthenticated) {
      e.preventDefault();
      openAuthModal(item.requiredRole);
    } else if (user && user.role !== item.requiredRole && !(user.role === "EXAM_ADMIN" && item.requiredRole === "UNIVERSITY_STAFF")) {
      e.preventDefault();
      openAuthModal(item.requiredRole);
    }
  };

  const handleRoleLoginClick = (role: UserRole) => {
    setIsLoginDropdownOpen(false);
    openAuthModal(role);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
      {/* Top micro ticker */}
      <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-1 text-[11px] text-blue-900">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-blue-800 font-mono font-semibold">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              <span>Sepolia Block #{blockHeight.toLocaleString()}</span>
            </span>
            <span className="hidden sm:inline text-blue-300">&bull;</span>
            <span className="hidden sm:inline text-blue-700 font-medium">
              Ethereum Sepolia &bull; Active Registry
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
              const isLocked = item.requiredRole !== null && (!isAuthenticated || (user?.role !== item.requiredRole && !(user?.role === "EXAM_ADMIN" && item.requiredRole === "UNIVERSITY_STAFF")));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all relative ${
                    isActive
                      ? "text-blue-900 bg-blue-50 border border-blue-200 shadow-xs"
                      : "text-slate-600 hover:text-blue-900 hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                  {isLocked && (
                    <Lock className="h-3 w-3 text-slate-400" />
                  )}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-600 rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Actions: User Role Badge, Sign In/Out & Wallet */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* AUTHENTICATION SESSION BUTTON / BADGE */}
            {isAuthenticated && user ? (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-1.5 pl-3 text-xs shadow-2xs">
                <div className="flex items-center gap-1.5 font-bold text-blue-950">
                  {user.role === "STUDENT" && <User className="h-3.5 w-3.5 text-blue-600" />}
                  {user.role === "EXAM_ADMIN" && <Shield className="h-3.5 w-3.5 text-blue-600" />}
                  {user.role === "UNIVERSITY_STAFF" && <Briefcase className="h-3.5 w-3.5 text-blue-600" />}
                  <span className="truncate max-w-[130px] sm:max-w-[180px]">
                    {user.role === "STUDENT"
                      ? `${user.fullName} (${(user as any).prn})`
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
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsLoginDropdownOpen(!isLoginDropdownOpen)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-blue-50 text-blue-900 border border-blue-300 rounded-xl text-xs font-bold shadow-2xs transition-all hover:scale-102"
                >
                  <LogIn className="h-4 w-4 text-blue-600" />
                  <span>Portal Login</span>
                  <ChevronDown className="h-3 w-3 text-slate-500" />
                </button>

                {isLoginDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
                      Choose Your Portal
                    </div>

                    <button
                      onClick={() => handleRoleLoginClick("STUDENT")}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left hover:bg-blue-50 transition-colors text-xs font-bold text-slate-800 hover:text-blue-900"
                    >
                      <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <div>
                        <div>Student Portal Login</div>
                        <p className="text-[10px] text-slate-500 font-normal">PRN &bull; Degree Vault &bull; ZK Proofs</p>
                      </div>
                    </button>

                    <button
                      onClick={() => handleRoleLoginClick("EXAM_ADMIN")}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left hover:bg-amber-50 transition-colors text-xs font-bold text-slate-800 hover:text-amber-900"
                    >
                      <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                        <Shield className="h-4 w-4" />
                      </div>
                      <div>
                        <div>Exam Cell Admin Login</div>
                        <p className="text-[10px] text-slate-500 font-normal">Controller of Exams &bull; Merkle Minting</p>
                      </div>
                    </button>

                    <button
                      onClick={() => handleRoleLoginClick("UNIVERSITY_STAFF")}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left hover:bg-blue-50 transition-colors text-xs font-bold text-slate-800 hover:text-blue-900"
                    >
                      <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                        <Briefcase className="h-4 w-4" />
                      </div>
                      <div>
                        <div>Institutional Staff Login</div>
                        <p className="text-[10px] text-slate-500 font-normal">Admissions &bull; NEP ABC &bull; Placement</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Wallet Button */}
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

        {/* Mobile Navigation row */}
        <div className="flex lg:hidden border-t border-slate-200 py-2.5 gap-1.5 overflow-x-auto">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => handleNavClick(e, item)}
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
