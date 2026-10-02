import deployedAddresses from "./deployedAddresses.json";
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
}

export const contractConfig = {
  chainId: deployedAddresses.chainId || 11155111,
  network: deployedAddresses.network || "sepolia",
  identityRegistryAddress: deployedAddresses.identityRegistry,
  credentialRegistryAddress: deployedAddresses.credentialRegistry,
  deployedAt: deployedAddresses.deployedAt,
};

export { deployedAddresses, IdentityRegistryAbi, CredentialRegistryAbi };
