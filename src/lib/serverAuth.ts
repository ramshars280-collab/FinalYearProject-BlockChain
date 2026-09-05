import crypto from 'crypto';
import { AuthUser, StudentUser, AdminUser } from '../types/auth';

function getJwtSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error('AUTH_SECRET environment variable is missing. Server authentication is disabled.');
  }
  return secret.trim();
}

function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !password.trim()) {
    throw new Error('ADMIN_PASSWORD environment variable is missing. Admin authentication is disabled.');
  }
  return password.trim();
}

function getStudentDefaultPassword(): string {
  const password = process.env.STUDENT_DEFAULT_PASSWORD;
  if (!password || !password.trim()) {
    throw new Error('STUDENT_DEFAULT_PASSWORD environment variable is missing. Student authentication is disabled.');
  }
  return password.trim();
}

// Server-side credential metadata (never bundled to client JS)
const SERVER_ADMIN = {
  staffId: 'EXAM_ADMIN_MGM',
  fullName: 'Prof. V. M. Deshpande',
  department: 'Examination Authority' as const,
  authorizedWallet: '0x71C56538b15294500B73f8472B4fE963D4e58bEf',
};

const SERVER_STUDENTS: Record<string, { fullName: string; email: string; isWalletVerified: boolean }> = {
  'PRN20200101': {
    fullName: 'Aarav Sharma',
    email: 'aarav.sharma@mgmu.ac.in',
    isWalletVerified: true,
  },
  'PRN20200102': {
    fullName: 'Ananya Deshmukh',
    email: 'ananya.deshmukh@mgmu.ac.in',
    isWalletVerified: true,
  },
  'PRN20200103': {
    fullName: 'Rohan Kulkarni',
    email: 'rohan.kulkarni@mgmu.ac.in',
    isWalletVerified: false,
  },
};

export function verifyAdminCredentials(staffId: string, pass: string): AdminUser | null {
  const adminPassword = getAdminPassword();
  const cleanId = staffId.trim().toUpperCase();
  if (cleanId === SERVER_ADMIN.staffId && pass === adminPassword) {
    return {
      role: 'EXAM_ADMIN',
      staffId: SERVER_ADMIN.staffId,
      fullName: SERVER_ADMIN.fullName,
      department: SERVER_ADMIN.department,
      authorizedWallet: SERVER_ADMIN.authorizedWallet,
    };
  }
  return null;
}

export function verifyStudentCredentials(prn: string, pass: string): StudentUser | null {
  const studentPassword = getStudentDefaultPassword();
  const cleanPrn = prn.trim().toUpperCase();
  const record = SERVER_STUDENTS[cleanPrn];
  if (record && pass === studentPassword) {
    return {
      role: 'STUDENT',
      prn: cleanPrn,
      fullName: record.fullName,
      email: record.email,
      isWalletVerified: record.isWalletVerified,
    };
  }
  return null;
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
    const jwtSecret = getJwtSecret();
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expected = crypto.createHmac('sha256', jwtSecret).update(header + '.' + payload).digest('base64url');
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
      return data.user || null;
    }
  } catch {
    return null;
  }
  return null;
}
