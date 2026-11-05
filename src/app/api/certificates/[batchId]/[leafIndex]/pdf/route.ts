import { NextRequest, NextResponse } from 'next/server';
import { getBatchByIdDb, isSyntheticDemoPrn, isDatabaseUnavailableError } from '@/lib/db';
import { verifySessionToken, resolveSafeVerificationOrigin } from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getSepoliaConfig } from '@/lib/storage';
import { generateCertificatePdf, DynamicCertificatePdfData } from '@/lib/pdfGenerator';
import { getRequestId, jsonResponse, logger } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { batchId: string; leafIndex: string } }
) {
  const requestId = getRequestId(request);
  const startTime = Date.now();

  try {
    const clientIp = getClientIp(request);
    // Rate limit: 30 requests per minute per IP for dynamic PDF certificate generation
    const rateLimit = checkRateLimit(`pdf_download:${clientIp}`, { maxRequests: 30, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      logger.warn('PDF download rate limit exceeded', {
        requestId,
        route: `/api/certificates/${params?.batchId}/${params?.leafIndex}/pdf`,
        method: 'GET',
        statusCode: 429,
        durationMs: Date.now() - startTime,
        details: { clientIp },
      });
      return jsonResponse(
        {
          success: false,
          error: 'Too many certificate download requests. Please try again later.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          requestId,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
            'X-RateLimit-Limit': String(rateLimit.totalLimit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetTime / 1000)),
          },
        },
        requestId
      );
    }
    const rawBatchId = params?.batchId ? decodeURIComponent(params.batchId).trim() : '';
    const rawLeafIndex = params?.leafIndex ? decodeURIComponent(params.leafIndex).trim() : '';

    if (!rawBatchId || rawLeafIndex === '') {
      return jsonResponse(
        { success: false, error: 'Missing batchId or leafIndex parameters', requestId },
        { status: 400 },
        requestId
      );
    }

    const leafIndex = parseInt(rawLeafIndex, 10);
    if (isNaN(leafIndex) || leafIndex < 0) {
      return jsonResponse(
        { success: false, error: 'Invalid leafIndex parameter: must be a non-negative integer', requestId },
        { status: 400 },
        requestId
      );
    }

    // 1. Authoritative Database Lookup
    const batch = await getBatchByIdDb(rawBatchId);
    if (!batch) {
      return jsonResponse(
        { success: false, error: `Batch '${rawBatchId}' not found in registry`, requestId },
        { status: 404 },
        requestId
      );
    }

    if (!Array.isArray(batch.records) || leafIndex >= batch.records.length) {
      return jsonResponse(
        {
          success: false,
          error: `Credential record index #${leafIndex} not found in batch '${rawBatchId}' (total: ${batch.records?.length || 0})`,
          requestId,
        },
        { status: 404 },
        requestId
      );
    }

    const student = batch.records[leafIndex];
    if (!student || !student.prn) {
      return jsonResponse(
        { success: false, error: 'Malformed credential record in batch', requestId },
        { status: 500 },
        requestId
      );
    }

    // 2. Authorization / Privacy Check
    const sessionCookie = request.cookies.get('auth_session')?.value;
    const user = sessionCookie ? verifySessionToken(sessionCookie) : null;

    if (user?.role === 'STUDENT' && user.prn) {
      const studentPrn = user.prn.trim().toUpperCase();
      const recordPrn = student.prn.trim().toUpperCase();
      if (studentPrn !== recordPrn) {
        logger.warn('Student attempted unauthorized cross-student certificate download', {
          requestId,
          route: `/api/certificates/${rawBatchId}/${leafIndex}/pdf`,
          method: 'GET',
          statusCode: 403,
          durationMs: Date.now() - startTime,
          details: { authenticatedStudent: user.prn, requestedPrn: student.prn },
        });
        return jsonResponse(
          {
            success: false,
            error: 'Forbidden: You are not authorized to download certificates for other students.',
            requestId,
          },
          { status: 403 },
          requestId
        );
      }
    }

    // 3. Resolve Revocation & Demo Status
    const isRevoked = Array.isArray(batch.revokedIndices) && batch.revokedIndices.includes(leafIndex);
    const isDemo = isSyntheticDemoPrn(student.prn);

    // 4. Resolve Safe Verification Origin
    const origin = resolveSafeVerificationOrigin(request);
    const verifyUrl = `${origin}/?verify=${encodeURIComponent(batch.batchId)}/${leafIndex}`;

    // 5. Build Dynamic Certificate Payload
    const sepoliaConfig = getSepoliaConfig();
    const certNumber = `${batch.batchId}-LEAF-${String(leafIndex).padStart(4, '0')}`;

    const pdfData: DynamicCertificatePdfData = {
      studentName: student.fullName || 'Graduate Student',
      prn: student.prn,
      degree: student.degree || 'Bachelor of Technology',
      branch: student.branch || undefined,
      cgpa: student.cgpa !== undefined ? student.cgpa : undefined,
      graduationYear: student.graduationYear || undefined,
      issueDate: student.issueDate || '2026-11-03',
      certNumber,
      universityName: 'MGM University',
      instituteName: 'School of Engineering & Technology (SOET)',
      division: (student as any).division || undefined,
      batchId: batch.batchId,
      leafIndex,
      merkleRoot: batch.merkleRoot,
      contractAddress: sepoliaConfig.credentialRegistryAddress,
      verifyUrl,
      isRevoked,
      isDemo,
    };

    // 6. Generate Vector PDF Buffer
    const pdfBuffer = await generateCertificatePdf(pdfData);

    // Safe filename sanitization
    const safeBatchId = batch.batchId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safePrn = student.prn.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeBatchId}_${safePrn}.pdf`;

    logger.info('Certificate PDF generated successfully', {
      requestId,
      route: `/api/certificates/${rawBatchId}/${leafIndex}/pdf`,
      method: 'GET',
      statusCode: 200,
      durationMs: Date.now() - startTime,
      details: { batchId: rawBatchId, leafIndex },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'X-Request-ID': requestId,
      },
    });
  } catch (error: any) {
    const isDbDown = isDatabaseUnavailableError(error);
    const statusCode = isDbDown ? 503 : 500;
    logger.error('Failed to generate dynamic certificate PDF', error, {
      requestId,
      route: `/api/certificates/${params?.batchId}/${params?.leafIndex}/pdf`,
      method: 'GET',
      statusCode,
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      { success: false, error: isDbDown ? 'Database service unavailable' : 'Failed to generate dynamic certificate PDF', requestId },
      { status: statusCode },
      requestId
    );
  }
}
