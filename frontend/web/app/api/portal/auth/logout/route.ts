import 'server-only';
import { NextResponse } from 'next/server';
import { getWebEnv } from '@/lib/env';
import { clearPortalSession, readPortalSessionToken } from '@/lib/portal-auth/session';

export const runtime = 'nodejs';

/** POST /api/portal/auth/logout -> POST /portal/auth/logout — best-effort
 * revoke on the backend (PortalSession row deleted), then always clear the
 * local cookie regardless of the upstream call's outcome. */
export async function POST(): Promise<NextResponse> {
  const token = await readPortalSessionToken();
  if (token) {
    const env = getWebEnv();
    const apiBaseUrl = env.API_INTERNAL_URL ?? env.API_URL;
    try {
      await fetch(`${apiBaseUrl}/portal/auth/logout`, {
        method: 'POST',
        headers: { 'X-Portal-Session-Token': token },
        cache: 'no-store',
      });
    } catch (err) {
      console.error('[portal proxy] POST /portal/auth/logout failed', err);
    }
  }
  await clearPortalSession();
  return NextResponse.json({ loggedOut: true });
}
