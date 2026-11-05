import { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/serverAuth';
import { getRequestId, jsonResponse } from '@/lib/observability';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const token = request.cookies.get('auth_session')?.value;

  if (!token) {
    return jsonResponse({ authenticated: false, user: null, requestId }, { status: 200 }, requestId);
  }

  const user = verifySessionToken(token);
  if (!user) {
    const response = jsonResponse({ authenticated: false, user: null, requestId }, { status: 200 }, requestId);
    response.cookies.delete('auth_session');
    return response;
  }

  return jsonResponse({ authenticated: true, user, requestId }, { status: 200 }, requestId);
}
