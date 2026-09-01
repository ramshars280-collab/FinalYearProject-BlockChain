"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { UserRole } from "../types/auth";
import { RefreshCw } from "lucide-react";

interface AuthGuardProps {
  requiredRole: UserRole;
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export default function AuthGuard({
  requiredRole,
  children,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuth();

  const isAuthorized =
    isAuthenticated &&
    user &&
    (user.role === requiredRole || (user.role === "EXAM_ADMIN" && requiredRole === "UNIVERSITY_STAFF"));

  useEffect(() => {
    if (!isAuthorized) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}&role=${requiredRole}`);
    }
  }, [isAuthorized, router, pathname, requiredRole]);

  if (!isAuthorized) {
    return (
      <div className="py-24 max-w-md mx-auto text-center space-y-3">
        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-600">
          Redirecting to Portal Sign In...
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
