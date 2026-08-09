import type { JWTPayload } from 'jose';

/**
 * Hand-mirrored from backend/api/src/modules/platform/platform-context.ts's
 * PlatformAdminContext (GET /platform/me's response shape). Keep in sync
 * manually — same convention frontend/web/lib/auth/types.ts documents for
 * its own AuthenticatedUser.
 */
export interface PlatformAdminUser {
  id: string;
  email: string;
  fullName: string;
  role: 'SUPPORT' | 'SUPER_ADMIN';
}

/** See frontend/web/lib/auth/types.ts's SessionPayload for the full
 * reasoning (three Keycloak JWTs exceed a single cookie's ~4KB limit, so
 * only an opaque session ID lives in the cookie — this is what's actually
 * stored server-side in Redis, keyed by that ID). */
export interface SessionPayload extends JWTPayload {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  subject: string;
}

export interface SessionCookiePayload extends JWTPayload {
  sessionId: string;
}

export interface OAuthTransactionPayload extends JWTPayload {
  codeVerifier: string;
  state: string;
  nonce: string;
  returnTo: string;
}
