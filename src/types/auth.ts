export type UserRole = "STUDENT" | "EXAM_ADMIN" | "UNIVERSITY_STAFF";

export type DepartmentRole =
  | "PG_ADMISSIONS_OFFICER"
  | "NEP_ABC_COORDINATOR"
  | "PLACEMENT_OFFICER_TNP";

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

export interface StaffUser {
  role: "UNIVERSITY_STAFF";
  staffId: string;
  fullName: string;
  department: DepartmentRole;
}

export type AuthUser = StudentUser | AdminUser | StaffUser;

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  role: UserRole | null;
}
