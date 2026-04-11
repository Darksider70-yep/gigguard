import { NextRequest, NextResponse } from 'next/server';

const VALID_LOCALES = ['en', 'hi', 'ta', 'te', 'kn', 'mr'];

export async function PATCH(request: NextRequest) {
  const { preferred_language } = await request.json();

  if (!VALID_LOCALES.includes(preferred_language)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
  }

  // Extract JWT from cookie or Authorization header
  const token = request.cookies.get('gigguard_token')?.value
    ?? request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Forward to backend
  const backendRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/workers/language`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ preferred_language }),
  });

  if (!backendRes.ok) {
    return NextResponse.json({ error: 'Backend error' }, { status: 500 });
  }

  // Refresh JWT cookie with updated preferred_language
  const { jwt_token } = await backendRes.json();
  const response = NextResponse.json({ status: 'updated' });
  if (jwt_token) {
    response.cookies.set('gigguard_token', jwt_token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
  }

  return response;
}
