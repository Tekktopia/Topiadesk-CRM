import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/auth/session';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/microsoft/authorize — starts Microsoft consent.
 *
 * This is a browser NAVIGATION, not a fetch, so it cannot go through the
 * usual JSON proxy: the upstream responds 302 to login.microsoftonline.com,
 * and that Location has to reach the browser. `redirect: 'manual'` keeps
 * fetch from following it server-side (which would have this route download
 * Microsoft's sign-in page and return it as a body).
 */
export async function GET(): Promise<NextResponse> {
  const token = await getValidAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', process.env.APP_URL ?? 'http://localhost:3000'));

  const upstream = await fetch(`${process.env.API_INTERNAL_URL ?? process.env.API_URL}/integrations/microsoft/authorize`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'manual',
  });

  const location = upstream.headers.get('location');
  if (!location) {
    return NextResponse.redirect(new URL('/profile?microsoft=error', process.env.APP_URL ?? 'http://localhost:3000'));
  }
  return NextResponse.redirect(location);
}
