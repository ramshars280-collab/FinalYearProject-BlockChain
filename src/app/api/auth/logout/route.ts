import { NextRequest } from 'next/server';
import { getLogoutCookieOptions } from '@/lib/serverAuth';
import { getRequestId, jsonResponse, logger } from '@/lib/observability';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const startTime = Date.now();

  const response = jsonResponse(
    { success: true, message: 'Logged out successfully', requestId },
    { status: 200 },
    requestId
  );

  // Explicitly expire and delete the session cookie across all path scopes
  response.cookies.set('auth_session', '', getLogoutCookieOptions());

  logger.info('User session logged out', {
    requestId,
    route: '/api/auth/logout',
    method: 'POST',
    statusCode: 200,
    durationMs: Date.now() - startTime,
  });

  return response;
}
