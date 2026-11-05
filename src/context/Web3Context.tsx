"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { SupportedChainId, getNetworkConfig, isSupportedChainId, NetworkConfig } from "../contracts";
import { getProviderForChain } from "../lib/contracts";

export interface Web3ContextType {
  // 1. Application-level selected target network (independent of wallet)
  selectedAppChainId: SupportedChainId;
  setSelectedAppChainId: (chainId: SupportedChainId) => void;
  selectedNetworkConfig: NetworkConfig;

  // 2. Actual MetaMask wallet connection & network state
  walletChainId: number | null;
  walletAddress: string | null;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;

  // 3. Synchronization & mismatch state
  isWalletConnected: boolean;
  isNetworkMismatch: boolean;
  walletNetworkName: string;

  // 4. Live on-chain block height
  blockHeight: number | null;
  refreshBlockHeight: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextType | null>(null);

const STORAGE_KEY_SELECTED_NETWORK = "veritrust_selected_app_chain_id";

export function Web3Provider({ children }: { children: React.ReactNode }) {
  // 1. Selected Application Network State
  const defaultChainId: SupportedChainId =
    Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 31337 ? 31337 : 11155111;

  const [selectedAppChainId, setSelectedAppChainIdState] = useState<SupportedChainId>(defaultChainId);

  // Load persisted network preference from localStorage after mounting
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SELECTED_NETWORK);
      if (stored) {
        const parsed = Number(stored);
        if (isSupportedChainId(parsed)) {
          setSelectedAppChainIdState(parsed);
        }
      }
    } catch {
      // localStorage read error fallback
    }
  }, []);

  const setSelectedAppChainId = useCallback((chainId: SupportedChainId) => {
    setSelectedAppChainIdState(chainId);
    try {
      localStorage.setItem(STORAGE_KEY_SELECTED_NETWORK, String(chainId));
    } catch {
      // localStorage write error fallback
    }
  }, []);

  const selectedNetworkConfig = useMemo(() => {
    return getNetworkConfig(selectedAppChainId);
  }, [selectedAppChainId]);

  // 2. MetaMask Wallet State
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [blockHeight, setBlockHeight] = useState<number | null>(null);

  // Sync with window.ethereum
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      return;
    }

    const ethereum = (window as any).ethereum;

    // A. Initial check of connected accounts and chain ID
    const initCheck = async () => {
      try {
        const accounts = await ethereum.request({ method: "eth_accounts" });
        if (accounts && accounts.length > 0) {
          setWalletAddress(ethers.getAddress(accounts[0]));
        } else {
          setWalletAddress(null);
        }

        const chainHex = await ethereum.request({ method: "eth_chainId" });
        if (chainHex) {
          setWalletChainId(parseInt(chainHex, 16));
        }
      } catch (err) {
        console.warn("MetaMask initial check error:", err);
      }
    };

    initCheck();

    // B. Named event listeners for clean unmount/removal
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts && accounts.length > 0) {
        try {
          setWalletAddress(ethers.getAddress(accounts[0]));
        } catch {
          setWalletAddress(accounts[0]);
        }
      } else {
        setWalletAddress(null);
      }
    };

    const handleChainChanged = (chainHex: string) => {
      const parsedChainId = parseInt(chainHex, 16);
      setWalletChainId(parsedChainId);
    };

    const handleConnect = (connectInfo: { chainId: string }) => {
      if (connectInfo && connectInfo.chainId) {
        setWalletChainId(parseInt(connectInfo.chainId, 16));
      }
    };

    const handleDisconnect = () => {
      setWalletAddress(null);
      setWalletChainId(null);
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);
    ethereum.on("connect", handleConnect);
    ethereum.on("disconnect", handleDisconnect);

    return () => {
      if (ethereum.removeListener) {
        ethereum.removeListener("accountsChanged", handleAccountsChanged);
        ethereum.removeListener("chainChanged", handleChainChanged);
        ethereum.removeListener("connect", handleConnect);
        ethereum.removeListener("disconnect", handleDisconnect);
      }
    };
  }, []);

  // 3. Connect Wallet Action
  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      alert("MetaMask / Web3 provider not detected. Please install the MetaMask browser extension.");
      return;
    }

    setIsConnecting(true);
    try {
      const ethereum = (window as any).ethereum;
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) {
        try {
          setWalletAddress(ethers.getAddress(accounts[0]));
        } catch {
          setWalletAddress(accounts[0]);
        }
      }
      const chainHex = await ethereum.request({ method: "eth_chainId" });
      if (chainHex) {
        setWalletChainId(parseInt(chainHex, 16));
      }
    } catch (err: any) {
      console.error("MetaMask connection failed:", err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setWalletAddress(null);
    setWalletChainId(null);
  }, []);

  // 4. Live Block Height for Selected Network
  const refreshBlockHeight = useCallback(async () => {
    try {
      const provider = getProviderForChain(selectedAppChainId);
      const bNum = await provider.getBlockNumber();
      setBlockHeight(bNum);
    } catch (err) {
      // If node is offline, leave last known or null
    }
  }, [selectedAppChainId]);

  useEffect(() => {
    refreshBlockHeight();
    const interval = setInterval(refreshBlockHeight, 10000);
    return () => clearInterval(interval);
  }, [refreshBlockHeight]);

  // 5. Computed Status
  const isWalletConnected = Boolean(walletAddress);
  const isNetworkMismatch = Boolean(
    isWalletConnected && walletChainId !== null && walletChainId !== selectedAppChainId
  );

  const walletNetworkName = useMemo(() => {
    if (!walletChainId) return "Unknown";
    if (walletChainId === 31337) return "Hardhat Local (31337)";
    if (walletChainId === 11155111) return "Ethereum Sepolia (11155111)";
    if (walletChainId === 1) return "Ethereum Mainnet (1)";
    return `Chain ID: ${walletChainId}`;
  }, [walletChainId]);

  const value = useMemo(
    () => ({
      selectedAppChainId,
      setSelectedAppChainId,
      selectedNetworkConfig,
      walletChainId,
      walletAddress,
      isConnecting,
      connectWallet,
      disconnectWallet,
      isWalletConnected,
      isNetworkMismatch,
      walletNetworkName,
      blockHeight,
      refreshBlockHeight,
    }),
    [
      selectedAppChainId,
      setSelectedAppChainId,
      selectedNetworkConfig,
      walletChainId,
      walletAddress,
      isConnecting,
      connectWallet,
      disconnectWallet,
      isWalletConnected,
      isNetworkMismatch,
      walletNetworkName,
      blockHeight,
      refreshBlockHeight,
    ]
  );

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3(): Web3ContextType {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}

