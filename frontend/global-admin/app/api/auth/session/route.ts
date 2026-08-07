import { NextResponse } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';
import type { PlatformAdminUser } from '@/lib/auth/types';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse<{ user: PlatformAdminUser | null }>> {
  try {
    const res = await fetchApi('/platform/me');
    if (!res.ok) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    const user = (await res.json()) as PlatformAdminUser;
    return NextResponse.json({ user }, { status: 200 });
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    console.error('[auth/session] failed to fetch current platform admin', err);
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
