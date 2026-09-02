import { BatchRecord, IdentityBindingRecord, W3CCredentialPayload, ConsortiumInstitution, StudentDegreeData } from "../types";
import { buildBatchMerkleTree, createW3CCredential, hashCredentialSubject } from "./crypto";



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

export const INITIAL_STUDENTS_MGM_BATCH2: StudentDegreeData[] = [
  {
    prn: "PRN20200105",
    fullName: "Sneha Jagtap",
    degree: "Bachelor of Technology",
    branch: "Information Technology",
    cgpa: 9.15,
    graduationYear: 2024,
    issueDate: "2024-06-20",
    nheqfCredits: 168,
    nheqfLevel: 6.0,
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    division: "First Class with Distinction",
  },
  {
    prn: "PRN20200106",
    fullName: "Vikram Shinde",
    degree: "Bachelor of Technology",
    branch: "Electronics & Computer Engineering",
    cgpa: 8.60,
    graduationYear: 2024,
    issueDate: "2024-06-20",
    nheqfCredits: 164,
    nheqfLevel: 6.0,
    university: "MGM University, Chhatrapati Sambhajinagar",
    institutionCode: "MGMU-ENG-01",
    division: "First Class with Distinction",
  },
];

export const INITIAL_STUDENTS = INITIAL_STUDENTS_MGM;

const STORAGE_KEYS = {
  BATCHES: "mgm_blockchain_batches_v5",
  IDENTITIES: "mgm_blockchain_identities_v5",
  STUDENT_VAULT: "mgm_blockchain_student_vault_v5",
  SEPOLIA_CONFIG: "mgm_blockchain_sepolia_config_v5",
  CUSTOM_UNIVERSITIES: "mgm_blockchain_custom_universities_v5",
  REVOCATIONS: "mgm_blockchain_revocations_v5",
};

export function getConsortiumInstitutions(): ConsortiumInstitution[] {
  if (typeof window === "undefined") return CONSORTIUM_UNIVERSITIES;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_UNIVERSITIES);
    const custom: ConsortiumInstitution[] = raw ? JSON.parse(raw) : [];
    const all = [...CONSORTIUM_UNIVERSITIES];
    custom.forEach((c) => {
      if (!all.some((u) => u.id === c.id || u.code.toLowerCase() === c.code.toLowerCase())) {
        all.push(c);
      }
    });
    return all;
  } catch (e) {
    return CONSORTIUM_UNIVERSITIES;
  }
}

export function registerNewInstitution(institution: ConsortiumInstitution) {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_UNIVERSITIES);
  const custom: ConsortiumInstitution[] = raw ? JSON.parse(raw) : [];
  if (!custom.some((u) => u.id === institution.id || u.code.toLowerCase() === institution.code.toLowerCase())) {
    custom.push(institution);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_UNIVERSITIES, JSON.stringify(custom));
  }
}

export function getInstitutionByCode(code: string): ConsortiumInstitution | undefined {
  const all = getConsortiumInstitutions();
  return all.find((u) => u.code.toLowerCase() === code.toLowerCase());
}

export function getInstitutionByAddress(address: string): ConsortiumInstitution | undefined {
  const all = getConsortiumInstitutions();
  return all.find((u) => u.address.toLowerCase() === address.toLowerCase());
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

  const defaultBatches = [mgmBatch];

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

export type RevocationReasonCode =
  | "CLERICAL_CORRECTION"
  | "NAME_REVISION"
  | "ADMIN_REISSUE"
  | "MALPRACTICE_DISCIPLINARY";

export interface RevocationRecord {
  batchId: string;
  leafIndex: number;
  reasonCode: RevocationReasonCode;
  reasonTitle: string;
  reasonDescription: string;
  supersededByHash?: string;
  revokedAt: string;
  officerStaffId?: string;
}

export function getStoredRevocations(): Record<string, RevocationRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REVOCATIONS);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function saveRevocationRecord(record: RevocationRecord) {
  if (typeof window === "undefined") return;
  const current = getStoredRevocations();
  const key = `${record.batchId}_${record.leafIndex}`;
  current[key] = record;
  localStorage.setItem(STORAGE_KEYS.REVOCATIONS, JSON.stringify(current));
}

export function getRevocationDetail(batchId?: string, leafIndex?: number): RevocationRecord | null {
  if (!batchId || leafIndex === undefined || leafIndex === null) return null;
  const current = getStoredRevocations();
  return current[`${batchId}_${leafIndex}`] || null;
}
