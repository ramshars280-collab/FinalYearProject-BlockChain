export interface ConsortiumInstitution {
  id: string;
  name: string;
  shortName: string;
  code: string;
  address: string;
  city: string;
  state: string;
  establishedAct: string;
  website: string;
  crestColor: string;
}

export interface StudentDegreeData {
  prn: string;
  fullName: string;
  degree: string;
  branch: string;
  cgpa: number;
  graduationYear: number;
  issueDate: string;
  nheqfCredits?: number;
  nheqfLevel?: number;
  institute?: string;
  university: string;
  institutionCode?: string;
  seatNumber?: string;
  division?: string;
}

export interface MerkleProofData {
  batchId: string;
  leafIndex: number;
  leafHash: string;
  rootHash: string;
  proof: string[];
  contractAddress: string;
  network: string;
  chainId?: number;
}

export interface W3CCredentialPayload {
  "@context": string[];
  id: string;
  type: string[];
  issuer: {
    id?: string;
    name: string;
    url?: string;
    ethereumAddress: string;
    institutionCode?: string;
  };
  issuanceDate: string;
  credentialSubject: StudentDegreeData & {
    id?: string;
  };
  proof: {
    type: "EthereumMerkleProof2024" | "EIP712Signature2024" | "ZkSelectiveProof2024" | "SelectiveDisclosureProof2024";
    created: string;
    verificationMethod?: string;
    merkleProof?: MerkleProofData;
    zkProof?: SelectiveDisclosureProof;
    selectiveProof?: SelectiveDisclosureProof;
    signature?: string;
  };
}

export interface SelectiveDisclosureProof {
  attributeName: string;
  assertionType: "GTE" | "LTE" | "EQUALS" | "MEMBERSHIP";
  thresholdValue: number | string;
  actualSatisfied: boolean;
  commitmentHash: string;
  salt: string;
  disclosedAttributes: Partial<StudentDegreeData>;
  redactedAttributes: string[];
  proofHash: string;
  timestamp: number;
}

export type ZkSelectiveProof = SelectiveDisclosureProof;

export type BatchStatus = "PENDING_ANCHOR" | "ANCHORED" | "INSTITUTIONAL_STORED" | "ANCHOR_FAILED";

export interface BatchRecord {
  batchId: string;
  merkleRoot: string;
  ipfsCid: string;
  timestamp: number;
  issuer: string;
  institutionName?: string;
  institutionCode?: string;
  totalCredentials: number;
  revokedIndices: number[];
  records: StudentDegreeData[];
  status?: BatchStatus;
  txHash?: string;
  expectedChainId?: number;
  expectedContract?: string;
  anchoredAt?: number;
  isVerifiedOnChain?: boolean;
  onChainReason?: string;
}

export interface IdentityBindingRecord {
  prn: string;
  walletAddress: string;
  timestamp: number;
  signature: string;
  transactionHash?: string;
}

export interface CourseCreditRecord {
  courseCode: string;
  courseTitle: string;
  offeringUniversity: string;
  nheqfLevel: number;
  creditsEarned: number;
  grade: string;
  semester: string;
  completionDate: string;
  status: "VERIFIED_ON_CHAIN" | "PENDING_MATCH" | "CREDIT_DEFICIT";
}

export interface ResumeAuditRecord {
  candidateName: string;
  prn: string;
  reportedDegree: string;
  reportedCgpa: number;
  verifiedCgpa?: number;
  verifiedDegree?: string;
  status: "AUTHENTIC" | "CGPA_MISMATCH" | "PRN_NOT_FOUND" | "REVOKED";
  discrepancyDelta?: number;
}

export interface SemanticMismatchItem {
  field: string;
  claimed: string | number;
  certified: string | number;
  discrepancy: string;
}

export interface SemanticCheckResult {
  status: "MATCH" | "MISMATCH" | "SKIPPED";
  field_mismatches?: SemanticMismatchItem[];
  claimed?: {
    studentName?: string;
    prn?: string;
    cgpa?: number;
    degree?: string;
    branch?: string;
    graduationYear?: number;
  };
  certified?: {
    studentName?: string;
    prn?: string;
    cgpa?: number;
    degree?: string;
    branch?: string;
    graduationYear?: number;
  };
  reason?: string;
}

export type StandardVerificationOutcome =
  | "AUTHENTIC"
  | "CRYPTOGRAPHICALLY_INVALID"
  | "REVOKED"
  | "SEMANTIC_MISMATCH"
  | "VISUAL_ANOMALY_REVIEW"
  | "INCONCLUSIVE";

export interface VerificationResult {
  isValid: boolean;
  isRevoked: boolean;
  tamperDetected: boolean;
  tamperReason?: string;
  verificationOutcome?: StandardVerificationOutcome;
  visualAnalysisPending?: boolean;
  visualServiceOffline?: boolean;
  computedLeaf?: string;
  matchedRoot?: string;
  batchId?: string;
  leafIndex?: number;
  credential?: W3CCredentialPayload;
  network?: string;
  txHash?: string;
  verifiedAt: string;
  isZkSelectiveProof?: boolean;
  isSelectiveDisclosure?: boolean;
  issuingInstitutionName?: string;
  issuingInstitutionAddress?: string;
  diagnosticCode?: string;
  forensicScan?: {
    status: "COMPLETED" | "UNAVAILABLE" | "QUEUED";
    ai_confidence_score?: number;
    verdict?: "LOW ANOMALY" | "SUSPICIOUS" | "HIGH ANOMALY" | "AUTHENTIC" | "TAMPERED" | string;
    heatmap_base64?: string;
    metadata?: any;
    reason?: string;
  };
  semanticCheck?: SemanticCheckResult;
  verificationSource?: "SEPOLIA_RPC" | "LOCAL_RPC" | "STORAGE_REGISTRY";
  isLocalMerkleValid?: boolean;
  isOnChainAnchored?: boolean;
  batchStatus?: BatchStatus;
  anchoringStatusNote?: string;
}
