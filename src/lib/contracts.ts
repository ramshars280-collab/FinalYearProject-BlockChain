import { ethers } from "ethers";
import { getSepoliaConfig } from "./storage";
import { verifyProofClientSide } from "./crypto";
import { BatchRecord, BatchStatus } from "../types";
import {
  getNetworkConfig,
  isSupportedChainId,
  SupportedChainId,
  deployedAddressesLocal,
  deployedAddressesSepolia,
} from "../contracts";

export const IDENTITY_REGISTRY_ABI = [
  "function bindIdentity(string calldata prn, uint256 timestamp, bytes calldata signature) external",
  "function getBoundWallet(string calldata prn) external view returns (address)",
  "function getBoundPRN(address wallet) external view returns (string memory)",
  "function getBindingTimestamp(string calldata prn) external view returns (uint256)",
  "event IdentityBound(string indexed prnIndexed, string prn, address indexed wallet, uint256 timestamp)",
];

export const CREDENTIAL_REGISTRY_ABI = [
  "function registerInstitution(address issuerAddress, string calldata name) external",
  "function institutionNames(address) external view returns (string memory)",
  "function authorizedIssuers(address) external view returns (bool)",
  "function owner() external view returns (address)",
  "function batchToIssuerAddress(bytes32) external view returns (address)",
  "function anchorMerkleRoot(string calldata batchId, bytes32 merkleRoot, string calldata ipfsCid) external",
  "function revokeCredential(string calldata batchId, uint256 leafIndex) external",
  "function isCredentialRevoked(string calldata batchId, uint256 leafIndex) public view returns (bool)",
  "function verifyCredential(string calldata batchId, bytes32 leaf, bytes32[] calldata proof, uint256 leafIndex) external view returns (bool isValid, bool isRevoked)",
  "function getBatchInfo(string calldata batchId) external view returns (bytes32 merkleRoot, string memory ipfsCid, uint256 timestamp, address issuer, string memory institutionName, bool exists)",
  "event BatchAnchored(string indexed batchIdIndexed, string batchId, bytes32 merkleRoot, string ipfsCid, uint256 timestamp, address indexed issuer, string institutionName)",
  "event CredentialRevoked(string indexed batchIdIndexed, string batchId, uint256 leafIndex, uint256 timestamp, address indexed revoker)",
  "event InstitutionRegistered(address indexed issuerAddress, string name)",
];

/**
 * Server-side trusted provider factory for a specific chain ID.
 * Strictly uses server-side configured RPC URLs (disallows arbitrary client URLs).
 */
export function getProviderForChain(chainId: number): ethers.JsonRpcProvider {
  const netConfig = getNetworkConfig(chainId);
  return new ethers.JsonRpcProvider(netConfig.rpcUrl);
}

/**
 * General provider resolver with backward compatibility.
 * Can accept a chain ID (number) or fallback to active environment default.
 */
export function getProvider(chainIdOrRpc?: string | number): ethers.JsonRpcProvider {
  if (typeof chainIdOrRpc === "number") {
    return getProviderForChain(chainIdOrRpc);
  }
  if (typeof chainIdOrRpc === "string" && chainIdOrRpc.startsWith("http")) {
    return new ethers.JsonRpcProvider(chainIdOrRpc);
  }
  const defaultChain = Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 31337 ? 31337 : 11155111;
  return getProviderForChain(defaultChain);
}

/**
 * Pre-flight verification helper: checks if deployed contract bytecode exists at target address.
 */
export async function verifyContractBytecode(
  contractAddress: string,
  providerOrChainId?: ethers.Provider | number
): Promise<{ hasBytecode: boolean; bytecodeLength: number; error?: string }> {
  try {
    const provider =
      typeof providerOrChainId === "number"
        ? getProviderForChain(providerOrChainId)
        : providerOrChainId || getProvider();
    const code = await provider.getCode(contractAddress);
    const hasBytecode = Boolean(code && code !== "0x" && code.length > 2);
    const bytecodeLength = hasBytecode ? (code.length - 2) / 2 : 0;
    return { hasBytecode, bytecodeLength };
  } catch (err: any) {
    return { hasBytecode: false, bytecodeLength: 0, error: err?.message || "Failed to query bytecode" };
  }
}

/**
 * Client-Side / Zero-Gas verification querying the configured blockchain via eth_call
 * with seamless fallback to off-chain stored registry state.
 * Supports both Hardhat Local (31337) and Ethereum Sepolia (11155111).
 */
export async function verifyCredentialOnChain(
  batchId: string,
  leafHash: string,
  proof: string[],
  leafIndex: number,
  contractAddress?: string,
  preferredChainId?: number
): Promise<{
  isValid: boolean;
  isRevoked: boolean;
  rootHash: string;
  source: "SEPOLIA_RPC" | "LOCAL_RPC" | "STORAGE_REGISTRY";
  onChainVerified: boolean;
  onChainError?: string;
  batchStatus?: BatchStatus;
  txHash?: string | null;
  chainId?: number;
  networkName?: string;
  issuingInstitutionName?: string;
  issuingInstitutionAddress?: string;
}> {
  // Determine target chain
  let targetChainId: SupportedChainId = 11155111;
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    if (preferredChainId && preferredChainId === 31337) {
      return {
        isValid: false,
        isRevoked: false,
        rootHash: "",
        source: "STORAGE_REGISTRY",
        onChainVerified: false,
        onChainError: "Hardhat Localhost (31337) is strictly disabled in production environment.",
      };
    }
    targetChainId = 11155111;
  } else if (preferredChainId && isSupportedChainId(preferredChainId)) {
    targetChainId = preferredChainId;
  } else if (contractAddress) {
    const cleanAddr = contractAddress.trim().toLowerCase();
    if (cleanAddr === deployedAddressesLocal.credentialRegistry.toLowerCase()) {
      targetChainId = 31337;
    } else if (cleanAddr === deployedAddressesSepolia.credentialRegistry.toLowerCase()) {
      targetChainId = 11155111;
    } else {
      targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 31337 ? 31337 : 11155111;
    }
  } else {
    targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 31337 ? 31337 : 11155111;
  }

  const netConfig = getNetworkConfig(targetChainId);
  const targetAddress = contractAddress || netConfig.credentialRegistry;
  let onChainError: string | undefined;

  // 1. Attempt direct on-chain eth_call to target network
  try {
    const provider = getProviderForChain(targetChainId);

    // Verify contract bytecode exists
    const code = await provider.getCode(targetAddress);
    if (!code || code === "0x" || code.length <= 2) {
      throw new Error(`Credential Registry contract ${targetAddress} has no deployed bytecode on ${netConfig.name} (Chain ID: ${targetChainId}).`);
    }

    const contract = new ethers.Contract(targetAddress, CREDENTIAL_REGISTRY_ABI, provider);
    const batchInfo = await contract.getBatchInfo(batchId);

    if (!batchInfo || !batchInfo.exists) {
      throw new Error(`Batch '${batchId}' is not anchored in the ${netConfig.name} registry contract.`);
    }

    const [isValid, isRevoked] = await contract.verifyCredential(
      batchId,
      leafHash,
      proof,
      leafIndex
    );

    return {
      isValid: Boolean(isValid),
      isRevoked: Boolean(isRevoked),
      rootHash: batchInfo.merkleRoot,
      source: targetChainId === 31337 ? "LOCAL_RPC" : "SEPOLIA_RPC",
      onChainVerified: true,
      batchStatus: "ANCHORED",
      chainId: targetChainId,
      networkName: netConfig.name,
      issuingInstitutionName: batchInfo.institutionName || "Consortium University",
      issuingInstitutionAddress: batchInfo.issuer,
    };
  } catch (error: any) {
    onChainError = error?.message || `${netConfig.name} RPC verification fell back to local registry`;
    console.warn(`Direct ${netConfig.name} RPC call fell back to local registry:`, error?.message);
  }

  // 2. Fallback to API / Database Registry
  let batch: BatchRecord | null = null;
  if (typeof window === "undefined") {
    try {
      const { getBatchByIdDb } = await import("./db");
      batch = (await getBatchByIdDb(batchId)) || null;
    } catch (e) {
      // server-side fallback
    }
  } else {
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(batchId)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.batch) {
          batch = data.batch;
        }
      }
    } catch (err) {
      console.warn("Could not fetch batch from API fallback:", err);
    }
  }

  if (!batch) {
    return {
      isValid: false,
      isRevoked: false,
      rootHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      source: "STORAGE_REGISTRY",
      onChainVerified: false,
      onChainError: onChainError || "Batch not found in registry",
      batchStatus: "INSTITUTIONAL_STORED",
      chainId: targetChainId,
      networkName: "Institutional Database Registry (Off-Chain)",
    };
  }

  const validProof = verifyProofClientSide(leafHash, proof, batch.merkleRoot);
  const isRevoked = Array.isArray(batch.revokedIndices) && batch.revokedIndices.includes(leafIndex);

  let isOnChainVerified = false;
  let finalBatchStatus: BatchStatus =
    batch.status === "PENDING_ANCHOR"
      ? "PENDING_ANCHOR"
      : batch.status === "ANCHOR_FAILED"
      ? "ANCHOR_FAILED"
      : "INSTITUTIONAL_STORED";
  let finalSource: "SEPOLIA_RPC" | "LOCAL_RPC" | "STORAGE_REGISTRY" = "STORAGE_REGISTRY";

  if (batch.status === "ANCHORED" && batch.txHash) {
    const evidence = await verifyBatchAnchorEvidence(
      batch.batchId,
      batch.merkleRoot,
      batch.txHash,
      targetAddress,
      undefined,
      targetChainId
    );
    if (evidence.isVerifiedOnChain) {
      isOnChainVerified = true;
      finalBatchStatus = "ANCHORED";
      finalSource = targetChainId === 31337 ? "LOCAL_RPC" : "SEPOLIA_RPC";
    } else {
      finalBatchStatus = "INSTITUTIONAL_STORED";
      onChainError = evidence.reason || "Batch anchor verification failed";
    }
  }

  return {
    isValid: validProof,
    isRevoked,
    rootHash: batch.merkleRoot,
    source: finalSource,
    onChainVerified: isOnChainVerified,
    onChainError,
    batchStatus: finalBatchStatus,
    txHash: batch.txHash || null,
    chainId: targetChainId,
    networkName: isOnChainVerified ? netConfig.name : "Institutional Database Registry (Off-Chain)",
    issuingInstitutionName: batch.institutionName || "MGM University, Chhatrapati Sambhajinagar",
    issuingInstitutionAddress: batch.issuer,
  };
}

/**
 * Anchors a batch Merkle Root either to target network (via signer) or updates simulated local state.
 */
export async function anchorMerkleBatch(
  batchId: string,
  merkleRoot: string,
  ipfsCid: string,
  signer?: ethers.Signer | null,
  targetChainId?: number
): Promise<{ txHash: string; blockNumber: number; simulated: boolean }> {
  const activeChainId = targetChainId ?? (Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 11155111);
  const netConfig = getNetworkConfig(activeChainId);

  if (signer) {
    try {
      const contract = new ethers.Contract(
        netConfig.credentialRegistry,
        CREDENTIAL_REGISTRY_ABI,
        signer
      );
      const tx = await contract.anchorMerkleRoot(batchId, merkleRoot, ipfsCid);
      const receipt = await tx.wait(1);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        simulated: false,
      };
    } catch (e: any) {
      console.warn(`${netConfig.name} anchor transaction bypassed to simulated mode:`, e?.message);
    }
  }

  // Simulated fallback mode
  const randomBytes = ethers.hexlify(ethers.randomBytes(32));
  return {
    txHash: randomBytes,
    blockNumber: 6294021 + Math.floor(Math.random() * 500),
    simulated: true,
  };
}

/**
 * Revokes a credential in the dynamic 256-bit bitmap.
 */
export async function revokeCredentialOnChain(
  batchId: string,
  leafIndex: number,
  signer?: ethers.Signer | null,
  targetChainId?: number
): Promise<{ txHash: string; simulated: boolean }> {
  const activeChainId = targetChainId ?? (Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 11155111);
  const netConfig = getNetworkConfig(activeChainId);

  if (signer) {
    try {
      const contract = new ethers.Contract(
        netConfig.credentialRegistry,
        CREDENTIAL_REGISTRY_ABI,
        signer
      );
      const tx = await contract.revokeCredential(batchId, leafIndex);
      const receipt = await tx.wait(1);
      return { txHash: receipt.hash, simulated: false };
    } catch (e) {
      console.warn(`${netConfig.name} revoke call fell back to local storage:`, e);
    }
  }

  // Fallback to API / Database Registry
  if (typeof window !== "undefined") {
    const res = await fetch("/api/batches/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ batchId, leafIndex }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error(
          data.error || "Unauthorized (401): Only an authenticated Examination Administrator can revoke credentials."
        );
      }
      throw new Error(data.error || `Revocation failed with status ${res.status}`);
    }
  } else {
    try {
      const { revokeBatchLeafDb } = await import("./db");
      await revokeBatchLeafDb(batchId, leafIndex);
    } catch (e: any) {
      console.warn("Server-side revoke fallback error:", e);
    }
  }

  return { txHash: ethers.hexlify(ethers.randomBytes(32)), simulated: true };
}

export interface AnchorEvidenceResult {
  isVerifiedOnChain: boolean;
  reason?: string;
  contractAddress?: string;
  txHash?: string;
  blockNumber?: number;
  blockTimestamp?: number;
  eventMerkleRoot?: string;
  eventBatchId?: string;
  eventIssuer?: string;
  chainId?: number;
  networkName?: string;
}

const MAX_ANCHOR_CACHE_SIZE = 100;
const ANCHOR_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  result: AnchorEvidenceResult;
  expiresAt: number;
}

const anchorEvidenceCache = new Map<string, CacheEntry>();

export function clearAnchorEvidenceCache(): void {
  anchorEvidenceCache.clear();
}

export function invalidateBatchAnchorEvidence(batchId?: string): void {
  if (!batchId) {
    anchorEvidenceCache.clear();
    return;
  }
  const cleanId = batchId.trim().toLowerCase();
  for (const key of Array.from(anchorEvidenceCache.keys())) {
    const parts = key.split(":");
    if (parts.length >= 3 && parts[2] === cleanId) {
      anchorEvidenceCache.delete(key);
    } else if (key.includes(`:${cleanId}:`)) {
      anchorEvidenceCache.delete(key);
    }
  }
}

export function getAnchorEvidenceCacheSize(): number {
  return anchorEvidenceCache.size;
}

export function setAnchorEvidenceCacheEntryForTesting(
  key: string,
  result: AnchorEvidenceResult,
  expiresAt: number
): void {
  anchorEvidenceCache.set(key, { result, expiresAt });
}

function pruneAnchorEvidenceCache(): void {
  const now = Date.now();
  for (const [key, entry] of anchorEvidenceCache.entries()) {
    if (now >= entry.expiresAt) {
      anchorEvidenceCache.delete(key);
    }
  }
  while (anchorEvidenceCache.size >= MAX_ANCHOR_CACHE_SIZE) {
    const oldestKey = anchorEvidenceCache.keys().next().value;
    if (!oldestKey) break;
    anchorEvidenceCache.delete(oldestKey);
  }
}

/**
 * Internal single-network evidence verification pass.
 */
async function verifyEvidenceOnSpecificChain(
  batchId: string,
  expectedMerkleRoot: string,
  cleanTx: string,
  targetChainId: SupportedChainId,
  customContractAddress?: string,
  customProvider?: ethers.Provider
): Promise<AnchorEvidenceResult> {
  const netConfig = getNetworkConfig(targetChainId);
  const targetContract = (customContractAddress || netConfig.credentialRegistry || "").trim();

  const cacheKey = `${targetChainId}:${targetContract.toLowerCase()}:${batchId.toLowerCase()}:${cleanTx.toLowerCase()}:${expectedMerkleRoot.toLowerCase()}`;
  const cached = anchorEvidenceCache.get(cacheKey);
  if (cached) {
    if (Date.now() < cached.expiresAt) {
      return cached.result;
    } else {
      anchorEvidenceCache.delete(cacheKey);
    }
  }

  const provider = customProvider || getProviderForChain(targetChainId);

  try {
    // 1. Verify deployed contract bytecode exists at target registry address
    const code = await provider.getCode(targetContract);
    if (!code || code === "0x" || code.length <= 2) {
      return {
        isVerifiedOnChain: false,
        reason: `Credential Registry contract ${targetContract} has no deployed bytecode on ${netConfig.name} (Chain ID ${targetChainId}).`,
      };
    }

    // 2. Verify provider network chain ID
    const network = await provider.getNetwork();
    const expectedChain = BigInt(targetChainId);
    if (network.chainId !== expectedChain) {
      return {
        isVerifiedOnChain: false,
        reason: `Network mismatch: expected chain ID ${expectedChain}, connected to ${network.chainId}.`,
      };
    }

    // 3. Query transaction receipt
    const receipt = await provider.getTransactionReceipt(cleanTx);
    if (!receipt) {
      return {
        isVerifiedOnChain: false,
        reason: `Transaction receipt not found on-chain (${netConfig.name}) for hash ${cleanTx}.`,
      };
    }

    // 4. Verify receipt execution status (must be 1, not reverted/0)
    if (receipt.status !== 1) {
      return {
        isVerifiedOnChain: false,
        reason: `Transaction ${cleanTx} failed or reverted on-chain (status = 0).`,
      };
    }

    // 5. Verify recipient is the expected registry contract
    if (!receipt.to || receipt.to.toLowerCase() !== targetContract.toLowerCase()) {
      return {
        isVerifiedOnChain: false,
        reason: `Contract mismatch: Transaction recipient (${receipt.to || "null"}) does not match registry (${targetContract}).`,
      };
    }

    // 6. Parse BatchAnchored event from receipt logs
    const iface = new ethers.Interface(CREDENTIAL_REGISTRY_ABI);
    let matchingEvent: ethers.LogDescription | null = null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== targetContract.toLowerCase()) continue;
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed && parsed.name === "BatchAnchored") {
          matchingEvent = parsed;
          break;
        }
      } catch {
        // continue search
      }
    }

    if (!matchingEvent) {
      return {
        isVerifiedOnChain: false,
        reason: `BatchAnchored event not found in transaction receipt logs for ${cleanTx}.`,
      };
    }

    const eventBatchId = String(matchingEvent.args.batchId || "");
    const eventMerkleRoot = String(matchingEvent.args.merkleRoot || "");
    const eventIssuer = String(matchingEvent.args.issuer || "");

    // 7. Verify event batch ID matches
    if (eventBatchId.toLowerCase() !== batchId.toLowerCase()) {
      return {
        isVerifiedOnChain: false,
        reason: `Batch ID mismatch: Event anchored '${eventBatchId}', expected '${batchId}'.`,
      };
    }

    // 8. Verify event Merkle root matches
    if (eventMerkleRoot.toLowerCase() !== expectedMerkleRoot.toLowerCase()) {
      return {
        isVerifiedOnChain: false,
        reason: `Merkle root mismatch: Event anchored '${eventMerkleRoot}', expected '${expectedMerkleRoot}'.`,
      };
    }

    const successResult: AnchorEvidenceResult = {
      isVerifiedOnChain: true,
      contractAddress: targetContract,
      txHash: cleanTx,
      blockNumber: receipt.blockNumber,
      chainId: targetChainId,
      networkName: netConfig.name,
      eventMerkleRoot,
      eventBatchId,
      eventIssuer,
    };

    pruneAnchorEvidenceCache();
    anchorEvidenceCache.set(cacheKey, {
      result: successResult,
      expiresAt: Date.now() + ANCHOR_CACHE_TTL_MS,
    });

    return successResult;
  } catch (error: any) {
    return {
      isVerifiedOnChain: false,
      reason: error?.message || `Failed to verify on-chain evidence via ${netConfig.name} RPC.`,
    };
  }
}

/**
 * Independently validates on-chain blockchain evidence before any batch
 * or credential may claim confirmed on-chain anchoring.
 *
 * Strict Evidence Requirements (All must be verified):
 * 1. Non-empty transaction hash (txHash).
 * 2. Deployed contract bytecode exists at target registry address on target network.
 * 3. Successful transaction receipt (status === 1).
 * 4. Transaction recipient (receipt.to) matches target Credential Registry contract.
 * 5. Correct chain ID matches the network of the receipt.
 * 6. BatchAnchored event emitted in receipt logs from the registry contract.
 * 7. Decoded event batchId matches expected batchId and event merkleRoot matches expected merkleRoot.
 */
export async function verifyBatchAnchorEvidence(
  batchId: string,
  expectedMerkleRoot: string,
  txHash?: string | null,
  customContractAddress?: string,
  customProvider?: ethers.Provider,
  expectedChainId?: number
): Promise<AnchorEvidenceResult> {
  const cleanTx = typeof txHash === "string" ? txHash.trim() : "";
  if (!cleanTx || cleanTx === "null" || cleanTx === "undefined" || !cleanTx.startsWith("0x") || cleanTx.length !== 66) {
    return {
      isVerifiedOnChain: false,
      reason: "Missing or invalid transaction hash. Unanchored batch.",
    };
  }

  const isProduction = process.env.NODE_ENV === "production";

  // Case A: Explicit chain ID requested -> strictly check that chain ID only (no fallback)
  if (expectedChainId) {
    if (isProduction && expectedChainId === 31337) {
      return {
        isVerifiedOnChain: false,
        reason: "Hardhat Localhost (31337) is strictly disabled in production environment.",
      };
    }
    if (!isSupportedChainId(expectedChainId)) {
      return {
        isVerifiedOnChain: false,
        reason: `Unsupported chain ID ${expectedChainId}. Supported chains are 31337 and 11155111.`,
      };
    }
    return verifyEvidenceOnSpecificChain(
      batchId,
      expectedMerkleRoot,
      cleanTx,
      expectedChainId,
      customContractAddress,
      customProvider
    );
  }

  // Case B: Production Environment -> Strictly isolate to Ethereum Sepolia (11155111).
  // Production must NEVER fall back to Hardhat Localhost (31337).
  if (isProduction) {
    if (customContractAddress) {
      const cleanAddr = customContractAddress.trim().toLowerCase();
      if (
        cleanAddr === deployedAddressesLocal.credentialRegistry.toLowerCase() ||
        cleanAddr === deployedAddressesLocal.identityRegistry.toLowerCase()
      ) {
        return {
          isVerifiedOnChain: false,
          reason: "Hardhat Localhost contract address is strictly prohibited in production environment.",
        };
      }
    }
    const targetContract = customContractAddress || deployedAddressesSepolia.credentialRegistry;
    return verifyEvidenceOnSpecificChain(
      batchId,
      expectedMerkleRoot,
      cleanTx,
      11155111,
      targetContract,
      customProvider
    );
  }

  // Case C: Development / Non-production (preserve existing behavior for local testing)
  if (customContractAddress) {
    const cleanAddr = customContractAddress.trim().toLowerCase();
    if (cleanAddr === deployedAddressesLocal.credentialRegistry.toLowerCase()) {
      return verifyEvidenceOnSpecificChain(batchId, expectedMerkleRoot, cleanTx, 31337, customContractAddress, customProvider);
    }
    if (cleanAddr === deployedAddressesSepolia.credentialRegistry.toLowerCase()) {
      return verifyEvidenceOnSpecificChain(batchId, expectedMerkleRoot, cleanTx, 11155111, customContractAddress, customProvider);
    }
  }

  // Unspecified chain ID in development/test
  const activeChainId: SupportedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 31337 ? 31337 : 11155111;
  const primaryResult = await verifyEvidenceOnSpecificChain(
    batchId,
    expectedMerkleRoot,
    cleanTx,
    activeChainId,
    customContractAddress,
    customProvider
  );

  if (primaryResult.isVerifiedOnChain) {
    return primaryResult;
  }

  // If primary check didn't find receipt and caller didn't supply customProvider, check secondary network in dev only
  if (!customProvider && !isProduction) {
    const secondaryChainId: SupportedChainId = activeChainId === 31337 ? 11155111 : 31337;
    try {
      const secondaryResult = await verifyEvidenceOnSpecificChain(
        batchId,
        expectedMerkleRoot,
        cleanTx,
        secondaryChainId,
        customContractAddress
      );
      if (secondaryResult.isVerifiedOnChain) {
        return secondaryResult;
      }
    } catch {
      // secondary check failed
    }
  }

  return primaryResult;
}
