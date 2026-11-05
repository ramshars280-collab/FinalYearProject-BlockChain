import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminCredentials,
  verifyStudentCredentials,
  signSessionToken,
  getSessionCookieOptions,
  validateProductionAuthConfig,
  validateCsrfProtection,
} from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getRequestId, jsonResponse, logger, parseJsonBody } from '@/lib/observability';
import { isDatabaseUnavailableError } from '@/lib/db';
import { AuthUser } from '@/types/auth';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = getRequestId(request);

  try {
    // Validate CSRF headers
    const csrfCheck = validateCsrfProtection(request);
    if (!csrfCheck.valid) {
      logger.warn('Login request failed CSRF validation', {
        requestId,
        route: '/api/auth/login',
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

    // In production mode, reject login attempts if required secrets are using insecure defaults
    if (process.env.NODE_ENV === 'production') {
      const authValidation = validateProductionAuthConfig();
      if (!authValidation.valid) {
        logger.error('Production authentication configuration invalid', undefined, {
          requestId,
          route: '/api/auth/login',
          statusCode: 500,
          durationMs: Date.now() - startTime,
          details: { errors: authValidation.errors },
        });
        return jsonResponse(
          { success: false, error: 'Authentication service misconfigured in production', requestId },
          { status: 500 },
          requestId
        );
      }
    }

    const clientIp = getClientIp(request);
    // Rate limit: 10 attempts per minute per IP to mitigate credential brute-forcing
    const rateLimit = checkRateLimit(`login:${clientIp}`, { maxRequests: 10, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      logger.warn('Login rate limit exceeded', {
        requestId,
        route: '/api/auth/login',
        method: 'POST',
        statusCode: 429,
        durationMs: Date.now() - startTime,
        details: { clientIp, retryAfter: rateLimit.retryAfterSeconds },
      });
      return jsonResponse(
        {
          success: false,
          error: 'Too many login attempts. Please try again later.',
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

    // Safe JSON body parsing: malformed syntax returns HTTP 400 without leaking raw payload
    const parsedBody = await parseJsonBody<{
      role?: string;
      identifier?: string;
      password?: string;
    }>(request, requestId, { route: '/api/auth/login', method: 'POST', startTime });

    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const { role, identifier, password } = parsedBody.data;

    if (!role || !identifier || !password) {
      return jsonResponse(
        { success: false, error: 'Missing required credentials', requestId },
        { status: 400 },
        requestId
      );
    }

    let authUser: AuthUser | null = null;

    if (role === 'EXAM_ADMIN') {
      const admin = verifyAdminCredentials(identifier, password);
      if (!admin) {
        logger.warn('Admin authentication failed for identifier', {
          requestId,
          route: '/api/auth/login',
          method: 'POST',
          statusCode: 401,
          durationMs: Date.now() - startTime,
          details: { role, identifier },
        });
        return jsonResponse(
          {
            success: false,
            error: 'Invalid credentials. Please verify your identifier and password.',
            requestId,
          },
          { status: 401 },
          requestId
        );
      }
      authUser = admin;
    } else if (role === 'STUDENT') {
      const studentResult = await verifyStudentCredentials(identifier, password);
      if (!studentResult.success || !studentResult.user) {
        logger.warn('Student authentication failed', {
          requestId,
          route: '/api/auth/login',
          method: 'POST',
          statusCode: 401,
          durationMs: Date.now() - startTime,
          details: { role, identifier, error: studentResult.error },
        });
        return jsonResponse(
          {
            success: false,
            error: studentResult.error || 'Invalid credentials. Please verify your identifier and password.',
            requestId,
          },
          { status: 401 },
          requestId
        );
      }
      authUser = studentResult.user;
    } else {
      return jsonResponse(
        { success: false, error: 'Unsupported role', requestId },
        { status: 400 },
        requestId
      );
    }

    const token = signSessionToken(authUser);
    const response = jsonResponse({ success: true, user: authUser, requestId }, { status: 200 }, requestId);

    response.cookies.set('auth_session', token, getSessionCookieOptions());

    logger.info('User successfully authenticated', {
      requestId,
      route: '/api/auth/login',
      method: 'POST',
      statusCode: 200,
      durationMs: Date.now() - startTime,
      details: { role: authUser.role, userId: authUser.role === 'STUDENT' ? authUser.prn : authUser.staffId },
    });

    return response;
  } catch (err: any) {
    const isDbDown = isDatabaseUnavailableError(err);
    const statusCode = isDbDown ? 503 : 500;
    logger.error('Authentication service exception', err, {
      requestId,
      route: '/api/auth/login',
      method: 'POST',
      statusCode,
      durationMs: Date.now() - startTime,
    });
    return jsonResponse(
      {
        success: false,
        error: isDbDown ? 'Database service unavailable' : 'Authentication service unavailable',
        requestId,
      },
      { status: statusCode },
      requestId
    );
  }
}
