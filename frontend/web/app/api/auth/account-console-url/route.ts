import { NextResponse } from 'next/server';
import { getWebEnv } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * GET /api/auth/account-console-url — hands the Client Component profile
 * page Keycloak's own self-service account console URL (password/TOTP
 * management — see profile-view.tsx's "Security" section), without
 * rebuilding any of that UI ourselves. `KEYCLOAK_ISSUER_URL` is a
 * server-only env var (see lib/env.ts's header comment on why it's never
 * read at module scope / from a statically-prerendered Server Component),
 * so this tiny request-time Route Handler is the correct place to resolve
 * it rather than exposing it via NEXT_PUBLIC_*.
 */
export async function GET(): Promise<NextResponse<{ url: string }>> {
  const env = getWebEnv();
  return NextResponse.json({ url: `${env.KEYCLOAK_ISSUER_URL}/account` });
}
