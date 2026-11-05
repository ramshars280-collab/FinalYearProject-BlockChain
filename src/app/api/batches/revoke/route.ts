import { NextRequest } from 'next/server';
import { revokeBatchLeafDb, getBatchByIdDb, isDatabaseUnavailableError } from '@/lib/db';
import { verifySessionToken, validateCsrfProtection } from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getRequestId, jsonResponse, logger, parseJsonBody } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = getRequestId(request);

  try {
    const clientIp = getClientIp(request);
    // Rate limit: 20 revocation requests per minute per IP (conservative administrative limit)
    const rateLimit = checkRateLimit(`batch_revoke:${clientIp}`, { maxRequests: 20, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      logger.warn('Batch revocation rate limit exceeded', {
        requestId,
        route: '/api/batches/revoke',
        method: 'POST',
        statusCode: 429,
        durationMs: Date.now() - startTime,
        details: { clientIp },
      });
      return jsonResponse(
        {
          success: false,
          error: 'Too many credential revocation requests. Please try again later.',
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

    // 1. Verify CSRF
    const csrfCheck = validateCsrfProtection(request);
    if (!csrfCheck.valid) {
      logger.warn('Revocation request failed CSRF validation', {
        requestId,
        route: '/api/batches/revoke',
        method: 'POST',
        statusCode: 403,
        durationMs: Date.now() - startTime,
        details: { reason: csrfCheck.reason },
      });
      return jsonResponse(
        { success: false, error: 'CSRF validation failed: ' + csrfCheck.reason, requestId },
        { status: 403 },
        requestId
      );
    }

    const sessionCookie = request.cookies.get('auth_session')?.value;
    const user = sessionCookie ? verifySessionToken(sessionCookie) : null;

    if (!user || user.role !== 'EXAM_ADMIN') {
      logger.warn('Unauthorized batch revocation attempt', {
        requestId,
        route: '/api/batches/revoke',
        method: 'POST',
        statusCode: 401,
        durationMs: Date.now() - startTime,
      });
      return jsonResponse(
        { success: false, error: 'Unauthorized', requestId },
        { status: 401 },
        requestId
      );
    }

    // Safe JSON body parsing: malformed syntax returns HTTP 400
    const parsedBody = await parseJsonBody<{
      batchId?: string;
      leafIndex?: number | string;
      reasonCode?: string;
      reasonTitle?: string;
      reasonDescription?: string;
      supersededByHash?: string;
      officerStaffId?: string;
    }>(request, requestId, { route: '/api/batches/revoke', method: 'POST', startTime });

    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const {
      batchId,
      leafIndex,
      reasonCode,
      reasonTitle,
      reasonDescription,
      supersededByHash,
      officerStaffId,
    } = parsedBody.data;

    if (!batchId || typeof batchId !== 'string') {
      return jsonResponse(
        { success: false, error: 'Missing required field: batchId', requestId },
        { status: 400 },
        requestId
      );
    }

    const numIndex = Number(leafIndex);
    if (isNaN(numIndex) || numIndex < 0) {
      return jsonResponse(
        { success: false, error: 'Invalid leafIndex. Must be a non-negative integer.', requestId },
        { status: 400 },
        requestId
      );
    }

    const existing = await getBatchByIdDb(batchId);
    if (!existing) {
      return jsonResponse(
        { success: false, error: `Batch '${batchId}' not found in database.`, requestId },
        { status: 404 },
        requestId
      );
    }

    const updatedBatch = await revokeBatchLeafDb(batchId, numIndex, {
      reasonCode,
      reasonTitle,
      reasonDescription,
      supersededByHash,
      officerStaffId,
    });

    logger.info('Credential revoked successfully', {
      requestId,
      route: '/api/batches/revoke',
      method: 'POST',
      statusCode: 200,
      durationMs: Date.now() - startTime,
      details: { batchId, leafIndex: numIndex, reasonCode },
    });

    return jsonResponse(
      {
        success: true,
        message: `Credential index ${numIndex} in batch '${batchId}' revoked successfully.`,
        batch: updatedBatch,
        requestId,
      },
      { status: 200 },
      requestId
    );
  } catch (error: any) {
    const isDbDown = isDatabaseUnavailableError(error);
    const statusCode = isDbDown ? 503 : 500;
    logger.error('Error in batch revocation API', error, {
      requestId,
      route: '/api/batches/revoke',
      method: 'POST',
      statusCode,
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      { success: false, error: isDbDown ? 'Database service unavailable' : 'Failed to revoke credential in database', requestId },
      { status: statusCode },
      requestId
    );
  }
}
