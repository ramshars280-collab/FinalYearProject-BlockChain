import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { AuthUser, StudentUser, AdminUser } from '../types/auth';
import {
  getCredentialByPrnDb,
  getStudentAccountDb,
  setStudentPasswordDb,
  recordStudentLoginAttemptDb,
} from './db';

function getJwtSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret === 'soet_veritrust_dev_jwt_secret_fallback_key' || secret.length < 32) {
      throw new Error(
        '[ServerAuth FATAL] Production AUTH_SECRET is missing, insecure, or shorter than 32 characters. Fails closed.'
      );
    }
    return secret;
  }
  return secret || 'soet_veritrust_dev_jwt_secret_fallback_key';
}

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || 'admin123';
}

/**
 * Validates production environment configuration for authentication security.
 * In production mode (NODE_ENV=production):
 * 1. Requires strong AUTH_SECRET (at least 32 characters, non-fallback).
 * 2. Requires strong non-default ADMIN_PASSWORD.
 */
export function validateProductionAuthConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    return { valid: true, errors, warnings };
  }

  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret === 'soet_veritrust_dev_jwt_secret_fallback_key' || secret.length < 32) {
    errors.push(
      'AUTH_SECRET is unset, using development fallback, or shorter than 32 characters in production. Configure a strong 64-character secret.'
    );
  }

  const adminPass = process.env.ADMIN_PASSWORD?.trim();
  if (!adminPass || adminPass === 'admin123') {
    errors.push(
      'ADMIN_PASSWORD is unset or using development default "admin123" in production. A strong unique password is required.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Server-side credential metadata (never bundled to client JS)
const SERVER_ADMIN = {
  staffId: process.env.ADMIN_STAFF_ID?.trim() || 'EXAM_ADMIN_MGM',
  fullName: process.env.ADMIN_FULL_NAME?.trim() || 'Prof. V. M. Deshpande',
  department: 'Examination Authority' as const,
  authorizedWallet: process.env.ADMIN_AUTHORIZED_WALLET?.trim() || '0x8D0cC3553e9d812797B986F15427835A2930a301',
  institutionCode: process.env.ADMIN_INSTITUTION_CODE?.trim() || 'MGMU-ENG-01',
  institutionName: process.env.ADMIN_INSTITUTION_NAME?.trim() || 'MGM University, Chhatrapati Sambhajinagar',
};

/**
 * Hashes a plaintext password using Node.js built-in scrypt with a unique random 16-byte salt.
 * Format: scrypt:<salt_hex>:<derived_key_hex>
 */
export function hashPassword(plaintext: string, customSaltHex?: string): string {
  const salt = customSaltHex ? Buffer.from(customSaltHex, 'hex') : crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(plaintext, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a candidate password against either a scrypt-hashed string or an env-supplied password.
 * Uses crypto.timingSafeEqual to prevent timing side-channel attacks.
 */
export function verifyPassword(candidate: string, storedHashOrPlain: string): boolean {
  if (!candidate || !storedHashOrPlain) return false;

  // Case A: Scrypt hashed string format: scrypt:<salt_hex>:<hash_hex>
  if (storedHashOrPlain.startsWith('scrypt:')) {
    const parts = storedHashOrPlain.split(':');
    if (parts.length !== 3) return false;
    const [, saltHex, hashHex] = parts;
    if (!/^[0-9a-fA-F]{32}$/.test(saltHex) || !/^[0-9a-fA-F]{128}$/.test(hashHex)) {
      return false;
    }
    try {
      const salt = Buffer.from(saltHex, 'hex');
      const expectedKey = Buffer.from(hashHex, 'hex');
      if (salt.length !== 16 || expectedKey.length !== 64) {
        return false;
      }
      const actualKey = crypto.scryptSync(candidate, salt, 64);
      return crypto.timingSafeEqual(actualKey, expectedKey);
    } catch {
      return false;
    }
  }

  // Case B: Stored/env plaintext password with constant-time HMAC comparison
  const hmacKey = getJwtSecret();
  const candidateHmac = crypto.createHmac('sha256', hmacKey).update(candidate).digest();
  const expectedHmac = crypto.createHmac('sha256', hmacKey).update(storedHashOrPlain).digest();
  return crypto.timingSafeEqual(candidateHmac, expectedHmac);
}

export function verifyAdminCredentials(staffId: string, pass: string): AdminUser | null {
  const adminPassword = getAdminPassword();
  const cleanId = staffId.trim().toUpperCase();
  if (cleanId === SERVER_ADMIN.staffId && verifyPassword(pass, adminPassword)) {
    return {
      role: 'EXAM_ADMIN',
      staffId: SERVER_ADMIN.staffId,
      fullName: SERVER_ADMIN.fullName,
      department: SERVER_ADMIN.department,
      authorizedWallet: SERVER_ADMIN.authorizedWallet,
      institutionCode: SERVER_ADMIN.institutionCode,
      institutionName: SERVER_ADMIN.institutionName,
    };
  }
  return null;
}

export interface StudentAuthResult {
  success: boolean;
  user?: StudentUser;
  error?: string;
}

/**
 * Authenticates a student against individual salted scrypt password hash stored in student_accounts.
 * Direct PRN and password authentication without activation tokens or timed lockouts.
 */
export async function verifyStudentCredentials(prn: string, pass: string): Promise<StudentAuthResult> {
  const cleanPrn = prn.trim().toUpperCase();

  // 1. Check if an official degree credential exists for this PRN
  const cred = await getCredentialByPrnDb(cleanPrn);
  if (!cred) {
    return {
      success: false,
      error: 'Invalid credentials. Please verify your identifier and password.',
    };
  }

  // 2. Fetch student security account record
  const account = await getStudentAccountDb(cleanPrn);
  if (!account) {
    return {
      success: false,
      error: 'Invalid credentials. Please verify your identifier and password.',
    };
  }

  // 3. Verify password has been configured
  if (!account.passwordHash) {
    return {
      success: false,
      error: 'No password has been set for this student account. Please contact the Examination Authority.',
    };
  }

  // 4. Verify individual scrypt password hash
  const isValidPassword = verifyPassword(pass, account.passwordHash);
  if (!isValidPassword) {
    await recordStudentLoginAttemptDb(cleanPrn, false);
    return {
      success: false,
      error: 'Invalid credentials. Please verify your identifier and password.',
    };
  }

  // 5. Login succeeded: update last_login_at
  await recordStudentLoginAttemptDb(cleanPrn, true);

  const studentUser: StudentUser = {
    role: 'STUDENT',
    prn: cleanPrn,
    fullName: cred.fullName,
    email: `${cred.fullName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@mgmu.ac.in`,
    isWalletVerified: false,
  };

  return {
    success: true,
    user: studentUser,
  };
}

/**
 * Administrator method to provision an initial password or reset an existing password for a student.
 * Uses individual salted scrypt hashing. Plaintext passwords are never stored.
 */
export async function adminSetStudentPassword(
  prn: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const cleanPrn = prn.trim().toUpperCase();
  if (!newPassword || newPassword.length < 8) {
    return {
      success: false,
      error: 'Password must be at least 8 characters long.',
    };
  }

  const cred = await getCredentialByPrnDb(cleanPrn);
  if (!cred) {
    return {
      success: false,
      error: `Student with PRN '${cleanPrn}' not found in issued credential records.`,
    };
  }

  const scryptHash = hashPassword(newPassword);
  await setStudentPasswordDb(cleanPrn, scryptHash);
  return { success: true };
}

/**
 * Validates CSRF origin and referer for mutating state-changing HTTP requests (POST, PUT, PATCH, DELETE).
 */
export function validateCsrfProtection(request: NextRequest): { valid: boolean; reason?: string } {
  // Safe read-only HTTP methods do not require CSRF origin validation
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { valid: true };
  }

  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');
  const hostHeader = request.headers.get('host');

  // If both origin and referer are completely absent (e.g., non-browser API test without cookies)
  const sessionCookie = request.cookies.get('auth_session')?.value;
  if (!originHeader && !refererHeader) {
    if (sessionCookie) {
      return { valid: false, reason: 'Missing Origin and Referer headers on credentialed request' };
    }
    return { valid: true };
  }

  const checkUrl = originHeader || refererHeader;
  if (!checkUrl) return { valid: true };

  try {
    const parsed = new URL(checkUrl);
    if (hostHeader && parsed.host.toLowerCase() !== hostHeader.toLowerCase()) {
      return { valid: false, reason: `Origin header ${parsed.host} does not match Host ${hostHeader}` };
    }
  } catch {
    return { valid: false, reason: 'Malformed Origin or Referer header' };
  }

  return { valid: true };
}

/**
 * Safely resolves the canonical public application origin for QR verification URLs.
 * Strictly prevents Host header poisoning and QR SSRF injection.
 * 
 * Order of precedence:
 * 1. NEXT_PUBLIC_APP_URL or APP_URL (explicitly configured canonical URL)
 * 2. VERCEL_URL (production serverless host set by Vercel platform)
 * 3. ALLOWED_ORIGINS whitelist (if candidate request origin matches an allowed entry)
 * 4. Loopback addresses (localhost, 127.0.0.1) ONLY when NODE_ENV !== 'production'
 * 5. Production safe default (never blindly reflects unverified Host / Forwarded-Host)
 */
export function resolveSafeVerificationOrigin(request: NextRequest): string {
  // 1. Explicitly configured public application URL takes highest priority
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configuredAppUrl && configuredAppUrl.trim()) {
    try {
      return new URL(configuredAppUrl.trim()).origin;
    } catch {
      console.warn('[PDF Route] Invalid NEXT_PUBLIC_APP_URL configured; falling back.');
    }
  }

  // 2. Production Vercel canonical deployment URL
  if (process.env.VERCEL_URL && process.env.VERCEL_URL.trim()) {
    return `https://${process.env.VERCEL_URL.trim()}`;
  }

  // 3. Check configured ALLOWED_ORIGINS whitelist
  const rawAllowed = process.env.ALLOWED_ORIGINS || '';
  const allowedList = rawAllowed
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Safely extract candidate origin from request
  let candidateOrigin = '';
  try {
    candidateOrigin = request.nextUrl.origin;
  } catch {}

  // If candidate origin matches an explicitly whitelisted origin in ALLOWED_ORIGINS
  if (candidateOrigin && allowedList.includes(candidateOrigin)) {
    return candidateOrigin;
  }

  // 4. Safe Local Development & Automated Testing (NODE_ENV !== 'production')
  // In dev/test, safely allow loopback addresses (localhost and 127.0.0.1 on any port)
  if (process.env.NODE_ENV !== 'production' && candidateOrigin) {
    try {
      const parsed = new URL(candidateOrigin);
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
        return parsed.origin;
      }
    } catch {}
  }

  // 5. Fail-Safe: Never reflect untrusted or arbitrary Host headers
  if (allowedList.length > 0) {
    return allowedList[0];
  }

  return process.env.NODE_ENV === 'production'
    ? 'https://soet-veritrust.vercel.app'
    : 'http://localhost:3000';
}

export function signSessionToken(user: AuthUser): string {
  const jwtSecret = getJwtSecret();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      user,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', jwtSecret).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + signature;
}

export function verifySessionToken(token: string): AuthUser | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const jwtSecret = getJwtSecret();
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expected = crypto.createHmac('sha256', jwtSecret).update(header + '.' + payload).digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (crypto.timingSafeEqual(sigBuf, expBuf)) {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
      return data.user || null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Standard cookie configuration for active authentication sessions.
 */
export function getSessionCookieOptions(isProduction: boolean = process.env.NODE_ENV === 'production') {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
    path: '/',
  };
}

/**
 * Standard cookie configuration to immediately expire and purge session cookies.
 */
export function getLogoutCookieOptions(isProduction: boolean = process.env.NODE_ENV === 'production') {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    maxAge: 0,
    expires: new Date(0),
    path: '/',
  };
}
