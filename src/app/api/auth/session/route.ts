import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/serverAuth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_session')?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  const user = verifySessionToken(token);
  if (!user) {
    const response = NextResponse.json({ authenticated: false, user: null });
    response.cookies.delete('auth_session');
    return response;
  }

  return NextResponse.json({ authenticated: true, user });
}
