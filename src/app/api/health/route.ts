import { NextRequest } from 'next/server';
import { getDatabaseStatus } from '@/lib/db';
import { getRequestId, jsonResponse, logger } from '@/lib/observability';

export const dynamic = 'force-dynamic';

/**
 * Health & Readiness Diagnostic Endpoint for SOET VeriTrust
 *
 * Checks HTTP application responsiveness and SQLite database availability.
 * Returns HTTP 200 with service metadata when healthy.
 * Returns HTTP 503 when the database is inaccessible or corrupted.
 *
 * PRIVACY & SECURITY GUARANTEES:
 * - Minimal public surface: returns only health status and availability.
 * - Removes internal implementation metadata: no journal modes, record counts, or environment names.
 * - Never discloses internal filesystem paths, connection strings, or stack traces.
 * - Emits sanitized database status descriptors ('healthy' | 'unavailable').
 * - Preserves request correlation with X-Request-ID headers and structured server logs.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = getRequestId(request);

  try {
    const dbStatus = await getDatabaseStatus();

    if (!dbStatus.exists) {
      logger.warn('Health check reported database unavailable', {
        requestId,
        route: '/api/health',
        method: 'GET',
        statusCode: 503,
        durationMs: Date.now() - startTime,
      });

      return jsonResponse(
        {
          status: 'UNHEALTHY',
          service: 'SOET VeriTrust Web & Verification API',
          timestamp: new Date().toISOString(),
          requestId,
          database: {
            status: 'unavailable',
            accessible: false,
          },
          error: 'Database service unavailable',
        },
        { status: 503 },
        requestId
      );
    }

    return jsonResponse(
      {
        status: 'HEALTHY',
        service: 'SOET VeriTrust Web & Verification API',
        timestamp: new Date().toISOString(),
        requestId,
        database: {
          status: 'healthy',
          accessible: true,
        },
      },
      { status: 200 },
      requestId
    );
  } catch (err: any) {
    logger.error('Health check exception occurred', err, {
      requestId,
      route: '/api/health',
      method: 'GET',
      statusCode: 503,
      durationMs: Date.now() - startTime,
    });

    return jsonResponse(
      {
        status: 'UNHEALTHY',
        service: 'SOET VeriTrust Web & Verification API',
        timestamp: new Date().toISOString(),
        requestId,
        database: {
          status: 'unavailable',
          accessible: false,
        },
        error: 'Database service unavailable',
      },
      { status: 503 },
      requestId
    );
  }
}
