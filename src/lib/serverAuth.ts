import crypto from 'crypto';
import { AuthUser, StudentUser, AdminUser } from '../types/auth';

const JWT_SECRET = process.env.AUTH_SECRET || 'soet_veritrust_jwt_secret_sepolia_2026';

// Server-side credential repository (never bundled to client JS)
const SERVER_ADMIN = {
  staffId: 'EXAM_ADMIN_MGM',
  password: process.env.ADMIN_PASSWORD || 'admin@mgm2026',
  fullName: 'Prof. V. M. Deshpande',
  department: 'Examination Authority' as const,
  authorizedWallet: '0x71C56538b15294500B73f8472B4fE963D4e58bEf',
};

const SERVER_STUDENTS: Record<string, { password: string; fullName: string; email: string; isWalletVerified: boolean }> = {
  'PRN20200101': {
    password: process.env.STUDENT_DEFAULT_PASSWORD || 'student123',
    fullName: 'Aarav Sharma',
    email: 'aarav.sharma@mgmu.ac.in',
    isWalletVerified: true,
  },
  'PRN20200102': {
    password: process.env.STUDENT_DEFAULT_PASSWORD || 'student123',
    fullName: 'Ananya Deshmukh',
    email: 'ananya.deshmukh@mgmu.ac.in',
    isWalletVerified: true,
  },
  'PRN20200103': {
    password: process.env.STUDENT_DEFAULT_PASSWORD || 'student123',
    fullName: 'Rohan Kulkarni',
    email: 'rohan.kulkarni@mgmu.ac.in',
    isWalletVerified: false,
  },
};

export function verifyAdminCredentials(staffId: string, pass: string): AdminUser | null {
  const cleanId = staffId.trim().toUpperCase();
  if (cleanId === SERVER_ADMIN.staffId && pass === SERVER_ADMIN.password) {
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
  const cleanPrn = prn.trim().toUpperCase();
  const record = SERVER_STUDENTS[cleanPrn];
  if (record && pass === record.password) {
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
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      user,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + signature;
}

export function verifySessionToken(token: string): AuthUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest('base64url');
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
