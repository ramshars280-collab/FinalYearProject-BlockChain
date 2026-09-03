import { ethers } from "ethers";

export interface EIP712DomainData {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export const EIP712_IDENTITY_TYPES = {
  IdentityBinding: [
    { name: "prn", type: "string" },
    { name: "wallet", type: "address" },
    { name: "timestamp", type: "uint256" },
  ],
};

export function getIdentityDomain(
  contractAddress: string,
  chainId: number = 11155111
): EIP712DomainData {
  return {
    name: "SOET VeriTrust",
    version: "1",
    chainId,
    verifyingContract: contractAddress,
  };
}

/**
 * Prompts student to sign an EIP-712 structured data message via MetaMask
 * to bind their permanent registration number (PRN) to their wallet address.
 */
export async function signIdentityBinding(
  signer: ethers.Signer,
  contractAddress: string,
  prn: string,
  chainId: number = 11155111
): Promise<{ signature: string; timestamp: number; wallet: string }> {
  const wallet = await signer.getAddress();
  const timestamp = Math.floor(Date.now() / 1000);
  const domain = getIdentityDomain(contractAddress, chainId);

  const value = {
    prn: prn.trim().toUpperCase(),
    wallet,
    timestamp,
  };

  const signature = await signer.signTypedData(
    domain,
    EIP712_IDENTITY_TYPES,
    value
  );

  return { signature, timestamp, wallet };
}

/**
 * Validates the EIP-712 signature locally without needing gas.
 */
export function verifyIdentityBindingSignature(
  prn: string,
  wallet: string,
  timestamp: number,
  signature: string,
  contractAddress: string,
  chainId: number = 11155111
): boolean {
  try {
    const domain = getIdentityDomain(contractAddress, chainId);
    const value = {
      prn: prn.trim().toUpperCase(),
      wallet: ethers.getAddress(wallet),
      timestamp,
    };

    const recovered = ethers.verifyTypedData(
      domain,
      EIP712_IDENTITY_TYPES,
      value,
      signature
    );

    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch (error) {
    console.error("EIP-712 verification failed:", error);
    return false;
  }
}
