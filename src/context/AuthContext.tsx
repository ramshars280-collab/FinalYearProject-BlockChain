"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { AuthUser, AuthState, UserRole, DepartmentRole, StudentUser, AdminUser, StaffUser } from "../types/auth";

const SESSION_KEY = "mgm_blockchain_session_v2";

export const DEMO_CREDENTIALS = {
  student: {
    prn: "PRN20200101",
    password: "student123",
    fullName: "Aarav Sharma",
  },
  admin: {
    staffId: "EXAM_ADMIN_MGM",
    password: "admin@mgm2026",
    fullName: "Prof. V. M. Deshpande (Controller of Exams)",
  },
  staff: {
    admissions: {
      staffId: "STAFF_ADM_01",
      password: "staff123",
      fullName: "Dr. P. R. Joshi (PG Admissions Chair)",
      department: "PG_ADMISSIONS_OFFICER" as DepartmentRole,
    },
    nep: {
      staffId: "STAFF_ABC_02",
      password: "staff123",
      fullName: "Prof. S. N. Kulkarni (NEP ABC Coordinator)",
      department: "NEP_ABC_COORDINATOR" as DepartmentRole,
    },
    placement: {
      staffId: "STAFF_TNP_03",
      password: "staff123",
      fullName: "Col. R. S. Rathore (Head, T&P Placement Cell)",
      department: "PLACEMENT_OFFICER_TNP" as DepartmentRole,
    },
  },
};

interface AuthContextType extends AuthState {
  loginStudent: (prn: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  loginAdmin: (staffId: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  loginStaff: (staffId: string, pass: string, department: DepartmentRole) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAuthModalOpen: boolean;
  openAuthModal: (initialRole?: UserRole) => void;
  closeAuthModal: () => void;
  modalInitialRole: UserRole;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [modalInitialRole, setModalInitialRole] = useState<UserRole>("STUDENT");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Session load error:", e);
    }
  }, []);

  const saveUserSession = (authUser: AuthUser | null) => {
    setUser(authUser);
    if (authUser) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(authUser));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  };

  const loginStudent = async (prnInput: string, passInput: string): Promise<{ success: boolean; error?: string }> => {
    const cleanPrn = prnInput.trim().toUpperCase();
    if (cleanPrn === "PRN20200101" && passInput === "student123") {
      const studentUser: StudentUser = {
        role: "STUDENT",
        prn: "PRN20200101",
        fullName: "Aarav Sharma",
        email: "aarav.sharma@mgmu.ac.in",
        isWalletVerified: true,
      };
      saveUserSession(studentUser);
      return { success: true };
    } else if (cleanPrn.startsWith("PRN") && passInput === "student123") {
      const studentUser: StudentUser = {
        role: "STUDENT",
        prn: cleanPrn,
        fullName: `Student (${cleanPrn})`,
        email: `${cleanPrn.toLowerCase()}@mgmu.ac.in`,
        isWalletVerified: false,
      };
      saveUserSession(studentUser);
      return { success: true };
    }
    return { success: false, error: "Invalid PRN or password. Use demo: PRN20200101 / student123" };
  };

  const loginAdmin = async (staffIdInput: string, passInput: string): Promise<{ success: boolean; error?: string }> => {
    const cleanStaffId = staffIdInput.trim().toUpperCase();
    if (cleanStaffId === "EXAM_ADMIN_MGM" && passInput === "admin@mgm2026") {
      const adminUser: AdminUser = {
        role: "EXAM_ADMIN",
        staffId: "EXAM_ADMIN_MGM",
        fullName: "Prof. V. M. Deshpande",
        department: "Examination Authority",
        authorizedWallet: "0x71C56538b15294500B73f8472B4fE963D4e58bEf",
      };
      saveUserSession(adminUser);
      return { success: true };
    }
    return { success: false, error: "Invalid Admin Staff ID or Master Password. Use demo: EXAM_ADMIN_MGM / admin@mgm2026" };
  };

  const loginStaff = async (
    staffIdInput: string,
    passInput: string,
    department: DepartmentRole
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanStaffId = staffIdInput.trim().toUpperCase();
    if (passInput === "staff123" || passInput === "admin@mgm2026") {
      let name = "University Staff";
      if (department === "PG_ADMISSIONS_OFFICER") name = "Dr. P. R. Joshi (Admissions)";
      else if (department === "NEP_ABC_COORDINATOR") name = "Prof. S. N. Kulkarni (NEP ABC)";
      else if (department === "PLACEMENT_OFFICER_TNP") name = "Col. R. S. Rathore (Placement T&P)";

      const staffUser: StaffUser = {
        role: "UNIVERSITY_STAFF",
        staffId: cleanStaffId || "STAFF_01",
        fullName: name,
        department,
      };
      saveUserSession(staffUser);
      return { success: true };
    }
    return { success: false, error: "Invalid Staff credentials. Use password: staff123" };
  };

  const logout = () => {
    saveUserSession(null);
  };

  const openAuthModal = (initialRole: UserRole = "STUDENT") => {
    setModalInitialRole(initialRole);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        role: user ? user.role : null,
        loginStudent,
        loginAdmin,
        loginStaff,
        logout,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        modalInitialRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
