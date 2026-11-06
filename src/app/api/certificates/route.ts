import { NextRequest } from 'next/server';
import { getAllBatchesDb, isDatabaseUnavailableError } from '@/lib/db';
import { verifySessionToken } from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getRequestId, jsonResponse, logger } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export interface IssuerCertificateItem {
  id: string;
  certificateId?: string;
  batchId: string;
  leafIndex: number;
  prn: string;
  studentName: string;
  degree: string;
  branch: string;
  cgpa: number;
  graduationYear?: number;
  issueDate: string;
  institute: string;
  institutionName?: string;
  institutionCode?: string;
  batchStatus: string;
  txHash: string | null;
  expectedChainId?: number;
  anchoredAt: number | null;
  merkleRoot: string;
  isVerifiedOnChain: boolean;
  isRevoked: boolean;
  revoked?: boolean;
  pdfUrl?: string;
  pdfDownloadUrl: string;
  student?: any;
  rawRecord: any;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = getRequestId(request);

  try {
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`issuer_certs:${clientIp}`, { maxRequests: 60, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      return jsonResponse(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          requestId,
        },
        { status: 429 },
        requestId
      );
    }

    // 1. Authenticate issuer session
    const sessionCookie = request.cookies.get('auth_session')?.value;
    const user = sessionCookie ? verifySessionToken(sessionCookie) : null;

    if (!user) {
      return jsonResponse(
        { success: false, error: 'Unauthorized: Administrative authentication required.', requestId },
        { status: 401 },
        requestId
      );
    }

    if (user.role !== 'EXAM_ADMIN') {
      return jsonResponse(
        { success: false, error: 'Forbidden: Only authenticated exam authorities can access the certificate registry.', requestId },
        { status: 403 },
        requestId
      );
    }

    // 2. Resolve Authenticated Institution
    const adminInstCode = ((user as any).institutionCode || 'MGMU-ENG-01').trim().toUpperCase();
    const adminWallet = ((user as any).authorizedWallet || '0x8D0cC3553e9d812797B986F15427835A2930a301').trim().toLowerCase();

    // 3. Query all batches and filter strictly to the authenticated institution
    const allBatches = await getAllBatchesDb();
    const institutionBatches = allBatches.filter((b) => {
      const bCode = (b.institutionCode || '').trim().toUpperCase();
      const bIssuer = (b.issuer || '').trim().toLowerCase();
      return (bCode && bCode === adminInstCode) || (bIssuer && bIssuer === adminWallet);
    });

    // 4. Flatten all student certificates from authorized batches
    const certificates: IssuerCertificateItem[] = [];

    institutionBatches.forEach((batch) => {
      if (!Array.isArray(batch.records)) return;

      batch.records.forEach((student, leafIndex) => {
        const isRevoked = Array.isArray(batch.revokedIndices) && batch.revokedIndices.includes(leafIndex);
        const isAnchored = batch.status === 'ANCHORED' && Boolean(batch.txHash);

        certificates.push({
          id: `${batch.batchId}_${student.prn || leafIndex}`,
          certificateId: `${batch.batchId}-${leafIndex}-${student.prn || leafIndex}`,
          batchId: batch.batchId,
          leafIndex,
          prn: student.prn,
          studentName: student.fullName || 'Unknown Student',
          degree: student.degree || 'Bachelor of Technology',
          branch: student.branch || 'General',
          cgpa: typeof student.cgpa === 'number' ? student.cgpa : 0,
          graduationYear: student.graduationYear,
          issueDate: student.issueDate || '2024-06-15',
          institute: student.university || batch.institutionName || 'MGM University',
          institutionName: batch.institutionName || 'MGM University',
          institutionCode: batch.institutionCode || 'MGMU-ENG-01',
          batchStatus: batch.status || 'INSTITUTIONAL_STORED',
          txHash: batch.txHash || null,
          expectedChainId: batch.expectedChainId || 31337,
          anchoredAt: batch.anchoredAt || null,
          merkleRoot: batch.merkleRoot,
          isVerifiedOnChain: isAnchored,
          isRevoked,
          revoked: isRevoked,
          pdfUrl: `/api/certificates/${encodeURIComponent(batch.batchId)}/${leafIndex}/pdf`,
          pdfDownloadUrl: `/api/certificates/${encodeURIComponent(batch.batchId)}/${leafIndex}/pdf`,
          student,
          rawRecord: student,
        });
      });
    });

    // 5. Query parameters filtering
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim().toLowerCase();
    const statusFilter = searchParams.get('status')?.trim().toUpperCase();

    let filteredCerts = certificates;

    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'REVOKED') {
        filteredCerts = filteredCerts.filter((c) => c.isRevoked);
      } else if (statusFilter === 'ANCHORED') {
        filteredCerts = filteredCerts.filter((c) => c.isVerifiedOnChain && !c.isRevoked);
      } else if (statusFilter === 'STORED') {
        filteredCerts = filteredCerts.filter((c) => !c.isVerifiedOnChain && !c.isRevoked);
      }
    }

    if (search) {
      filteredCerts = filteredCerts.filter(
        (c) =>
          c.prn.toLowerCase().includes(search) ||
          c.studentName.toLowerCase().includes(search) ||
          c.degree.toLowerCase().includes(search) ||
          c.branch.toLowerCase().includes(search) ||
          c.batchId.toLowerCase().includes(search)
      );
    }

    logger.info('Issuer certificates retrieved', {
      requestId,
      route: '/api/certificates',
      method: 'GET',
      statusCode: 200,
      durationMs: Date.now() - startTime,
      details: {
        adminStaffId: user.staffId,
        institutionCode: adminInstCode,
        totalBatches: institutionBatches.length,
        totalCerts: filteredCerts.length,
      },
    });

    return jsonResponse(
      {
        success: true,
        count: filteredCerts.length,
        total: certificates.length,
        institutionCode: adminInstCode,
        certificates: filteredCerts,
        requestId,
      },
      { status: 200 },
      requestId
    );
  } catch (error: any) {
    const isDbDown = isDatabaseUnavailableError(error);
    const statusCode = isDbDown ? 503 : 500;
    logger.error('Failed to list issuer certificates', error, {
      requestId,
      route: '/api/certificates',
      method: 'GET',
      statusCode,
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      {
        success: false,
        error: isDbDown ? 'Database service unavailable' : 'Failed to retrieve certificates',
        requestId,
      },
      { status: statusCode },
      requestId
    );
  }
}
