export type UserRole = "STUDENT" | "EXAM_ADMIN";

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
