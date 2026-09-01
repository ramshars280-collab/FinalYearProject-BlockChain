import { BatchRecord, IdentityBindingRecord, W3CCredentialPayload, ConsortiumInstitution, StudentDegreeData } from "../types";
import { buildBatchMerkleTree, createW3CCredential, hashCredentialSubject } from "./crypto";

const STORAGE_KEYS = {
  BATCHES: "mgm_blockchain_batches_v2",
  IDENTITIES: "mgm_blockchain_identities_v2",
  STUDENT_VAULT: "mgm_blockchain_student_vault_v2",
  SEPOLIA_CONFIG: "mgm_blockchain_sepolia_config_v2",
  SELECTED_INSTITUTION: "mgm_blockchain_selected_institution_v2",
};

export const CONSORTIUM_UNIVERSITIES: ConsortiumInstitution[] = [
  {
    id: "mgmu",
    name: "MGM University",
    shortName: "MGMU",
    code: "MGMU-ENG-01",
    address: "0x71C56538b15294500B73f8472B4fE963D4e58bEf",
    city: "Chhatrapati Sambhajinagar",
    state: "Maharashtra, India",
    establishedAct: "Established under Maharashtra Act No. XXVI of 2019",
    website: "https://mgmu.ac.in",
    crestColor: "blue",
  },
  {
    id: "sppu",
    name: "Savitribai Phule Pune University",
    shortName: "SPPU Pune",
    code: "SPPU-ENG-02",
    address: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
    city: "Pune",
    state: "Maharashtra, India",
    establishedAct: "Established under Poona University Act 1949 & Maharashtra Public Universities Act 2016",
    website: "http://www.unipune.ac.in",
    crestColor: "indigo",
  },
  {
    id: "mu",
    name: "University of Mumbai",
    shortName: "Mumbai University",
    code: "MU-ENG-03",
    address: "0xdD2FD4581271e230360230F9337D5c0430Bf44C0",
    city: "Mumbai",
    state: "Maharashtra, India",
    establishedAct: "Established on 18th July 1857 & Maharashtra Public Universities Act 2016",
    website: "https://mu.ac.in",
    crestColor: "amber",
  },
  {
    id: "coep",
    name: "COEP Technological University",
    shortName: "COEP Tech",
    code: "COEP-TECH-04",
    address: "0xbDA5747bFD65F08deb54cb465eB87D40e51B197E",
    city: "Pune",
    state: "Maharashtra, India",
    establishedAct: "Established under Maharashtra Act No. XXXV of 2022 (Estd. 1854)",
    website: "https://www.coep.org.in",
    crestColor: "emerald",
  },
];

export interface SepoliaConfig {
  credentialRegistryAddress: string;
  identityRegistryAddress: string;
  rpcUrl: string;
  chainId: number;
  isSimulatedNetwork: boolean;
}

export const DEFAULT_SEPOLIA_CONFIG: SepoliaConfig = {
  credentialRegistryAddress: "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7",
  identityRegistryAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  chainId: 11155111,
  isSimulatedNetwork: false,
};

// Initial Graduation Batches for Consortium Demo
export const INITIAL_STUDENTS_MGM: StudentDegreeData[] = [
  {
    prn: "PRN20200101",
    fullName: "Aarav Sharma",
    degree: "Bachelor of Technology",
    branch: "Computer Science & Engineering",
    cgpa: 9.24,
    graduationYear: 2024,
    issueDate: "2024-06-15",
    nheqfCredits: 164,
    nheqfLevel: 6.0,
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    division: "First Class with Distinction",
  },
  {
    prn: "PRN20200102",
    fullName: "Ananya Deshmukh",
    degree: "Bachelor of Technology",
    branch: "Artificial Intelligence & Data Science",
    cgpa: 8.85,
    graduationYear: 2024,
    issueDate: "2024-06-15",
    nheqfCredits: 162,
    nheqfLevel: 6.0,
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    division: "First Class with Distinction",
  },
  {
    prn: "PRN20200103",
    fullName: "Rohan Kulkarni",
    degree: "Bachelor of Technology",
    branch: "Information Technology",
    cgpa: 7.92,
    graduationYear: 2024,
    issueDate: "2024-06-15",
    nheqfCredits: 160,
    nheqfLevel: 6.0,
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    division: "First Class",
  },
  {
    prn: "PRN20200104",
    fullName: "Pooja Patil",
    degree: "Bachelor of Technology",
    branch: "Electronics & Computer Engineering",
    cgpa: 8.41,
    graduationYear: 2024,
    issueDate: "2024-06-15",
    nheqfCredits: 160,
    nheqfLevel: 6.0,
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    division: "First Class with Distinction",
  },
];

export const INITIAL_STUDENTS_SPPU: StudentDegreeData[] = [
  {
    prn: "SPPU20205819",
    fullName: "Sneha Jagtap",
    degree: "Bachelor of Engineering",
    branch: "Computer Engineering",
    cgpa: 9.15,
    graduationYear: 2024,
    issueDate: "2024-06-20",
    nheqfCredits: 168,
    nheqfLevel: 6.0,
    university: "Savitribai Phule Pune University",
    institutionCode: "SPPU-ENG-02",
    division: "First Class with Distinction",
  },
  {
    prn: "SPPU20205820",
    fullName: "Vikram Shinde",
    degree: "Bachelor of Engineering",
    branch: "Information Technology",
    cgpa: 8.60,
    graduationYear: 2024,
    issueDate: "2024-06-20",
    nheqfCredits: 164,
    nheqfLevel: 6.0,
    university: "Savitribai Phule Pune University",
    institutionCode: "SPPU-ENG-02",
    division: "First Class with Distinction",
  },
];

export const INITIAL_STUDENTS = INITIAL_STUDENTS_MGM;

export function getConsortiumInstitutions(): ConsortiumInstitution[] {
  return CONSORTIUM_UNIVERSITIES;
}

export function getInstitutionByCode(code: string): ConsortiumInstitution | undefined {
  return CONSORTIUM_UNIVERSITIES.find((u) => u.code.toLowerCase() === code.toLowerCase());
}

export function getInstitutionByAddress(address: string): ConsortiumInstitution | undefined {
  return CONSORTIUM_UNIVERSITIES.find((u) => u.address.toLowerCase() === address.toLowerCase());
}

export function getStoredBatches(): BatchRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BATCHES);
    if (!raw) {
      const initial = initializeDefaultBatches();
      return initial;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load batches:", e);
    return [];
  }
}

export function saveStoredBatches(batches: BatchRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(batches));
}

export function initializeDefaultBatches(): BatchRecord[] {
  const { rootHex: mgmRoot } = buildBatchMerkleTree(INITIAL_STUDENTS_MGM);
  const mgmBatchId = "MGM-2024-BTECH-BATCH01";
  
  const mgmBatch: BatchRecord = {
    batchId: mgmBatchId,
    merkleRoot: mgmRoot,
    ipfsCid: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
    timestamp: 1718438400,
    issuer: "0x71C56538b15294500B73f8472B4fE963D4e58bEf",
    institutionName: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    totalCredentials: INITIAL_STUDENTS_MGM.length,
    revokedIndices: [],
    records: INITIAL_STUDENTS_MGM,
  };

  const { rootHex: sppuRoot } = buildBatchMerkleTree(INITIAL_STUDENTS_SPPU);
  const sppuBatchId = "SPPU-2024-BE-BATCH01";

  const sppuBatch: BatchRecord = {
    batchId: sppuBatchId,
    merkleRoot: sppuRoot,
    ipfsCid: "QmZtmD2qt8fJpq3CLDH8TFZiakrirkqqn3D24ghj34h89",
    timestamp: 1718870400,
    issuer: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
    institutionName: "Savitribai Phule Pune University",
    institutionCode: "SPPU-ENG-02",
    totalCredentials: INITIAL_STUDENTS_SPPU.length,
    revokedIndices: [],
    records: INITIAL_STUDENTS_SPPU,
  };

  const defaultBatches = [mgmBatch, sppuBatch];

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(defaultBatches));
  }

  return defaultBatches;
}

export function getStoredIdentities(): Record<string, IdentityBindingRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.IDENTITIES);
    return raw ? JSON.parse(raw) : {
      "PRN20200101": {
        prn: "PRN20200101",
        walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        timestamp: 1718439000,
        signature: "0x5c42a2b0c156f3e0984852936230b42ffab264df7538c267e812d6a5c179c3cf0c19b22e1a3bc8c86d8b5c907106037e5e3ebf686300976d8b746c8270ec08d11c",
      }
    };
  } catch (e) {
    return {};
  }
}

export function saveIdentityBinding(record: IdentityBindingRecord) {
  if (typeof window === "undefined") return;
  const current = getStoredIdentities();
  current[record.prn.toUpperCase()] = record;
  localStorage.setItem(STORAGE_KEYS.IDENTITIES, JSON.stringify(current));
}

export function getSepoliaConfig(): SepoliaConfig {
  if (typeof window === "undefined") return DEFAULT_SEPOLIA_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SEPOLIA_CONFIG);
    return raw ? { ...DEFAULT_SEPOLIA_CONFIG, ...JSON.parse(raw) } : DEFAULT_SEPOLIA_CONFIG;
  } catch (e) {
    return DEFAULT_SEPOLIA_CONFIG;
  }
}

export function saveSepoliaConfig(config: Partial<SepoliaConfig>) {
  if (typeof window === "undefined") return;
  const current = getSepoliaConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(STORAGE_KEYS.SEPOLIA_CONFIG, JSON.stringify(updated));
}
