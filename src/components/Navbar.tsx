"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  ShieldCheck,
  UserCheck,
  Layers,
  Wallet,
  LogOut,
  User,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";

export default function Navbar() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();
  const {
    selectedAppChainId,
    selectedNetworkConfig,
    walletChainId,
    walletAddress,
    isConnecting,
    connectWallet,
    isWalletConnected,
    isNetworkMismatch,
    walletNetworkName,
    blockHeight,
  } = useWeb3();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Permanent TrueCred navigation entry points - always visible across all user states
  const navLinks = [
    { href: "/", label: "Public Verifier", icon: ShieldCheck },
    { href: "/student", label: "Student Vault", icon: UserCheck },
    { href: "/issuer", label: "University Admin", icon: Layers },
  ];

  const isLinkActive = (href: string) => {
    if (href === "/") {
      return pathname === "/" || pathname === "";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
      {/* Top Micro Ticker (Dynamically syncs with Selected App Network & Live Block Height) */}
      <div
        className={`border-b px-4 py-1 text-[11px] transition-colors ${
          selectedAppChainId === 31337
            ? "border-indigo-100 bg-indigo-50/70 text-indigo-900"
            : "border-blue-100 bg-blue-50/70 text-blue-900"
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 font-mono font-semibold ${
                selectedAppChainId === 31337 ? "text-indigo-900" : "text-blue-900"
              }`}
              suppressHydrationWarning
            >
              <span
                className={`h-2 w-2 rounded-full animate-pulse ${
                  selectedAppChainId === 31337 ? "bg-indigo-600" : "bg-blue-600"
                }`}
              />
              <span>
                {selectedAppChainId === 31337 ? "Hardhat Local (31337)" : "Ethereum Sepolia (11155111)"} Block #
                {mounted ? (blockHeight !== null ? blockHeight.toLocaleString() : "...") : "..."}
              </span>
            </span>
            <span className="hidden sm:inline text-slate-300">&bull;</span>
            <span className="hidden sm:inline font-medium">
              Target Network: {selectedNetworkConfig.name}
            </span>
          </div>

          {/* Network Mismatch Warning Banner in Ticker */}
          {isNetworkMismatch && mounted && (
            <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300 animate-pulse shrink-0">
              <AlertTriangle className="h-3 w-3 text-amber-700 shrink-0" />
              <span>
                MetaMask on {walletNetworkName} &bull; App set to {selectedNetworkConfig.name}
              </span>
            </div>
          )}
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
                TrueCred
              </span>
              <p className="text-[11px] text-slate-500 hidden sm:block leading-none mt-0.5">
                Blockchain Credential Verification Platform
              </p>
            </div>
          </Link>

          {/* CENTER: Navigation Links (Permanent 3 options) */}
          <nav className="hidden lg:flex items-center gap-1.5 shrink-0">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = isLinkActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
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

          {/* RIGHT: User Account Indicator + Dynamic MetaMask Connection Status */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isAuthenticated && user && (
              <div
                className="flex items-center gap-2 bg-blue-50/80 border border-blue-200 rounded-xl p-1 pl-2.5 sm:p-1.5 sm:pl-3 text-xs shadow-2xs"
                title={
                  user.role === "STUDENT"
                    ? `${(user as any).fullName || "Student"} (${(user as any).prn})`
                    : `${(user as any).fullName || "Officer"} (${(user as any).staffId || "Admin"})`
                }
              >
                <div className="flex items-center gap-1.5 font-bold text-blue-950">
                  {user.role === "STUDENT" ? (
                    <User className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  ) : (
                    <Shield className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  )}
                  <span className="hidden sm:inline font-mono text-[11px] font-semibold text-blue-900 max-w-[140px] truncate">
                    {user.role === "STUDENT"
                      ? (user as any).prn
                      : (user as any).staffId || "Admin"}
                  </span>
                </div>

                <button
                  onClick={() => logout()}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="h-3 w-3 text-slate-500 hover:text-red-600" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            )}

            {isWalletConnected && walletAddress ? (
              <div
                className={`flex items-center gap-2 bg-white border rounded-xl p-1.5 px-3 text-xs shadow-xs transition-colors ${
                  isNetworkMismatch ? "border-amber-300 bg-amber-50/40" : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <span
                    className={`h-2 w-2 rounded-full animate-pulse ${
                      isNetworkMismatch ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                  />
                  <span className="hidden sm:inline">MetaMask Connected</span>
                  <span className="sm:hidden">Connected</span>
                </div>

                {/* Actual Wallet Network Pill */}
                <div
                  className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold border ${
                    walletChainId === 31337
                      ? "bg-indigo-50 border-indigo-200 text-indigo-800"
                      : walletChainId === 11155111
                      ? "bg-blue-50 border-blue-200 text-blue-800"
                      : "bg-slate-100 border-slate-200 text-slate-700"
                  }`}
                >
                  {walletChainId === 31337
                    ? "Hardhat Local (31337)"
                    : walletChainId === 11155111
                    ? "Ethereum Sepolia (11155111)"
                    : walletNetworkName}
                </div>

                {/* Network Mismatch Badge */}
                {isNetworkMismatch && (
                  <span
                    className="px-1.5 py-0.5 bg-amber-200 text-amber-950 border border-amber-300 rounded text-[10px] font-extrabold uppercase tracking-tight"
                    title={`MetaMask is on ${walletNetworkName}, but application target is ${selectedNetworkConfig.name}. Please switch networks in MetaMask.`}
                  >
                    Mismatch
                  </span>
                )}
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all hover:scale-102 active:scale-98 disabled:opacity-50 cursor-pointer"
              >
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">{isConnecting ? "Connecting..." : "Wallet Not Connected"}</span>
                <span className="sm:hidden">{isConnecting ? "..." : "Connect"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile / Tablet Navigation bar */}
        <div className="flex lg:hidden border-t border-slate-200 py-2.5 gap-2 items-center justify-between overflow-x-auto">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = isLinkActive(link.href);
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
