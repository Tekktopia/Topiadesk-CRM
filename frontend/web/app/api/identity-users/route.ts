import { NextResponse } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';
import type { UserOption } from '@/app/(policy)/lib/types';

export const runtime = 'nodejs';

/**
 * GET /api/identity-users — best-effort id -> name directory, used purely
 * to render human names instead of raw UUIDs for `requestedById`/
 * `createdById`/`approvedById` on policy versions/premiums/documents. GET
 * /identity/users is gated on 'identity:read', which not every role holds
 * (see users.controller.ts) — a 403 here is expected for some users, so
 * this deliberately swallows failures and returns `[]` (200) rather than
 * propagating an error: the UI falls back to comparing raw ids against the
 * current user (see useCurrentUser()) when no directory is available,
 * which is all the maker-checker UI strictly needs.
 */
export async function GET(): Promise<NextResponse<UserOption[]>> {
  try {
    const res = await fetchApi('/identity/users?take=200');
    if (!res.ok) return NextResponse.json([], { status: 200 });
    const users = (await res.json()) as Array<{ id: string; fullName: string; email: string }>;
    return NextResponse.json(users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email })));
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) return NextResponse.json([], { status: 200 });
    console.error('[identity-users] failed', err);
    return NextResponse.json([], { status: 200 });
  }
}
