export type UserRole = "STUDENT" | "EXAM_ADMIN" | "ISSUER";

export interface StudentUser {
  role: "STUDENT";
  prn: string;
  fullName: string;
  email: string;
  isWalletVerified?: boolean;
}

export interface AdminUser {
  role: "EXAM_ADMIN";
  staffId: string;
  fullName: string;
  department: "Examination Authority";
  authorizedWallet?: string;
}

export type AuthUser = StudentUser | AdminUser;

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  role: UserRole | null;
}

export type StudentAccountStatus = "PENDING_ACTIVATION" | "ACTIVE" | "LOCKED";

export interface StudentAccountRecord {
  prn: string;
  passwordHash: string | null;
  activationTokenHash: string | null;
  activationExpiresAt: number | null;
  status: StudentAccountStatus;
  failedAttempts: number;
  lockedUntil: number;
  createdAt: number;
  activatedAt: number | null;
  lastLoginAt: number | null;
}

