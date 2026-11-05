import deployedAddressesSepolia from "./deployedAddresses.json";
import deployedAddressesLocal from "./deployedAddresses.local.json";
import IdentityRegistryAbi from "./abis/IdentityRegistry.json";
import CredentialRegistryAbi from "./abis/CredentialRegistry.json";

export interface DeployedAddressesSchema {
  network: string;
  chainId: number;
  identityRegistry: string;
  credentialRegistry: string;
  deployer: string;
  deployedAt: string;
  note?: string;
  txHashes?: {
    identityRegistry: string | null;
    credentialRegistry: string | null;
  };
  blockNumbers?: {
    identityRegistry: number | null;
    credentialRegistry: number | null;
  };
}

export type SupportedChainId = 31337 | 11155111;
export const SUPPORTED_CHAIN_IDS: readonly SupportedChainId[] = [31337, 11155111] as const;

export interface NetworkConfig {
  chainId: SupportedChainId;
  network: "localhost" | "sepolia";
  name: string;
  identityRegistry: string;
  credentialRegistry: string;
  deployer: string;
  deployedAt: string;
  rpcUrl: string;
  blockExplorer: string | null;
  isLocal: boolean;
}

export function isSupportedChainId(chainId: number): chainId is SupportedChainId {
  return chainId === 31337 || chainId === 11155111;
}

/**
 * Resolves the trusted network configuration for a given chain ID.
 * Strict rules:
 * - Chain 31337 resolves strictly to local Hardhat manifest.
 * - Chain 11155111 resolves strictly to Sepolia manifest.
 * - Any unsupported chain ID throws a descriptive error (no silent fallback).
 */
export function getNetworkConfig(chainId: number): NetworkConfig {
  const numericChainId = Number(chainId);

  if (numericChainId === 31337) {
    const local = deployedAddressesLocal as DeployedAddressesSchema;
    return {
      chainId: 31337,
      network: "localhost",
      name: "Hardhat Local (31337)",
      identityRegistry: local.identityRegistry,
      credentialRegistry: local.credentialRegistry,
      deployer: local.deployer,
      deployedAt: local.deployedAt,
      rpcUrl: process.env.LOCAL_RPC_URL || process.env.NEXT_PUBLIC_LOCAL_RPC_URL || "http://127.0.0.1:8545",
      blockExplorer: null,
      isLocal: true,
    };
  }

  if (numericChainId === 11155111) {
    const sepolia = deployedAddressesSepolia as DeployedAddressesSchema;
    // Known Hardhat test account #2 address used as legacy mock placeholder
    const HARDHAT_PLACEHOLDER_ACCOUNT_2 = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";
    const rawIdentityEnv = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY?.trim();
    const resolvedIdentity =
      rawIdentityEnv && rawIdentityEnv.toLowerCase() !== HARDHAT_PLACEHOLDER_ACCOUNT_2
        ? rawIdentityEnv
        : sepolia.identityRegistry;
    const resolvedCredential =
      process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY?.trim() || sepolia.credentialRegistry;

    return {
      chainId: 11155111,
      network: "sepolia",
      name: "Ethereum Sepolia (11155111)",
      identityRegistry: resolvedIdentity,
      credentialRegistry: resolvedCredential,
      deployer: sepolia.deployer,
      deployedAt: sepolia.deployedAt,
      rpcUrl:
        process.env.SEPOLIA_RPC_URL ||
        process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ||
        process.env.NEXT_PUBLIC_SEPOLIA_RPC ||
        "https://ethereum-sepolia-rpc.publicnode.com",
      blockExplorer: "https://sepolia.etherscan.io",
      isLocal: false,
    };
  }

  throw new Error(
    `Unsupported blockchain chain ID: ${chainId}. Supported networks are Hardhat Localhost (31337) and Ethereum Sepolia (11155111). Silent network fallback is prohibited.`
  );
}

export function resolveContractAddresses(chainId?: number): {
  identityRegistry: string;
  credentialRegistry: string;
  chainId: SupportedChainId;
  network: string;
  rpcUrl: string;
} {
  const activeChainId = chainId ?? (Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 11155111);
  const cfg = getNetworkConfig(activeChainId);
  return {
    identityRegistry: cfg.identityRegistry,
    credentialRegistry: cfg.credentialRegistry,
    chainId: cfg.chainId,
    network: cfg.network,
    rpcUrl: cfg.rpcUrl,
  };
}

const isLocalNetwork = Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 31337;
const activeDefaultConfig = getNetworkConfig(isLocalNetwork ? 31337 : 11155111);

export const contractConfig = {
  chainId: activeDefaultConfig.chainId,
  network: activeDefaultConfig.network,
  identityRegistryAddress: activeDefaultConfig.identityRegistry,
  credentialRegistryAddress: activeDefaultConfig.credentialRegistry,
  deployedAt: activeDefaultConfig.deployedAt,
};

const activeAddresses = isLocalNetwork ? deployedAddressesLocal : deployedAddressesSepolia;

export {
  activeAddresses as deployedAddresses,
  deployedAddressesSepolia,
  deployedAddressesLocal,
  IdentityRegistryAbi,
  CredentialRegistryAbi,
};
