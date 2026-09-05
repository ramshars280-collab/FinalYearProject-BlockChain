import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminCredentials, verifyStudentCredentials, signSessionToken } from '@/lib/serverAuth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { role, identifier, password } = body;

    if (!role || !identifier || !password) {
      return NextResponse.json(
        { success: false, error: 'Missing required credentials' },
        { status: 400 }
      );
    }

    let user = null;
    if (role === 'EXAM_ADMIN') {
      user = verifyAdminCredentials(identifier, password);
    } else if (role === 'STUDENT') {
      user = verifyStudentCredentials(identifier, password);
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error:
            role === 'EXAM_ADMIN'
              ? 'Invalid Admin Staff ID or Master Password'
              : 'Invalid Student PRN or password. Only registered students are authorized.',
        },
        { status: 401 }
      );
    }

    const token = signSessionToken(user);
    const response = NextResponse.json({ success: true, user });

    response.cookies.set('auth_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'Server authentication error' },
      { status: 500 }
    );
  }
}
