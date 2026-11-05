export interface CandidateAuditRecord {
  prn: string;
  claimedName: string;
  claimedCgpa: number;
  onChainName: string;
  onChainCgpa: number;
  onChainUniversity: string;
  status: "AUTHENTIC" | "DISCREPANCY" | "UNREGISTERED";
  flag: string;
}

/**
 * Clean initial candidate audit state.
 * Hardcoded/predefined demo candidates have been removed.
 * The audit matrix will be populated dynamically when student batches are uploaded and processed.
 */
export const INITIAL_AUDIT_CANDIDATES: CandidateAuditRecord[] = [];
