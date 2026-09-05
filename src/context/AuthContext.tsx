"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { AuthUser, AuthState, UserRole, StudentUser, AdminUser } from "../types/auth";

const SESSION_KEY = "mgm_blockchain_session_v3";

// Non-sensitive demo identity identifiers (passwords reside exclusively on the server)
export const DEMO_IDENTIFIERS = {
  studentPrn: "PRN20200101",
  adminStaffId: "EXAM_ADMIN_MGM",
};

interface AuthContextType extends AuthState {
  loginStudent: (prn: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  loginAdmin: (staffId: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    // Check server session cookie first
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setUser(data.user);
          localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
        } else {
          // Fall back to stored session if server session expired or unavailable
          try {
            const stored = localStorage.getItem(SESSION_KEY);
            if (stored) {
              setUser(JSON.parse(stored));
            }
          } catch (e) {
            console.error("Session load error:", e);
          }
        }
      })
      .catch(() => {
        try {
          const stored = localStorage.getItem(SESSION_KEY);
          if (stored) {
            setUser(JSON.parse(stored));
          }
        } catch (e) {
          console.error("Session load error:", e);
        }
      });
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
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "STUDENT",
          identifier: prnInput.trim(),
          password: passInput,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        saveUserSession(data.user);
        return { success: true };
      }
      return { success: false, error: data.error || "Authentication failed" };
    } catch (err: any) {
      return { success: false, error: "Unable to connect to authentication server" };
    }
  };

  const loginAdmin = async (staffIdInput: string, passInput: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "EXAM_ADMIN",
          identifier: staffIdInput.trim(),
          password: passInput,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        saveUserSession(data.user);
        return { success: true };
      }
      return { success: false, error: data.error || "Authentication failed" };
    } catch (err: any) {
      return { success: false, error: "Unable to connect to authentication server" };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    saveUserSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        role: user ? user.role : null,
        loginStudent,
        loginAdmin,
        logout,
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
