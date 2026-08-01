import 'server-only';
import { cookies } from 'next/headers';
import { getWebEnv } from '../env';
import {
  OAUTH_TXN_COOKIE_NAME,
  OAUTH_TXN_MAX_AGE_SECONDS,
  REFRESH_SKEW_SECONDS,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from './constants';
import { decryptPayload, encryptPayload } from './crypto';
import { refreshTokens } from './oidc';
import type { OAuthTransactionPayload, SessionPayload } from './types';

export { SESSION_COOKIE_NAME, OAUTH_TXN_COOKIE_NAME };

/**
 * Server-only cookie session management.
 *
 * Two cookies, both HttpOnly + encrypted (AES-256-GCM via `./crypto.ts`,
 * keyed off WEB_SESSION_SECRET) — tokens are never exposed to JS and never
 * touch localStorage/sessionStorage, per the compliance requirement that
 * XSS can't exfiltrate them:
 *
 *  - `td_session`: the real session — access/refresh/ID tokens plus their
 *    expiry, set after a successful callback, read on every request that
 *    needs to call the API.
 *  - `td_oauth_txn`: short-lived (5 min), holds the PKCE code_verifier +
 *    state + nonce for the single in-flight /login -> /callback round trip.
 *    Encrypted too, mainly to make the `returnTo` path tamper-evident
 *    (open-redirect guard) — see callback/route.ts, which also independently
 *    validates `returnTo` is a same-origin relative path regardless.
 *
 * `secure` is only forced in production: `pnpm --filter @topiadesk/web dev`
 * runs standalone on plain http://localhost, and a `Secure` cookie is
 * silently dropped by the browser over http, which would break local
 * testing entirely. Same reasoning for `domain` — WEB_COOKIE_DOMAIN (e.g.
 * `.topiadesk.localhost`) is only applied when explicitly set; a `domain`
 * attribute that isn't a suffix of the current host is rejected outright.
 *
 * Cookie names and timing constants live in `./constants.ts` (shared with
 * `middleware.ts`, which can't import this module — see that file's
 * top-of-file comment for why).
 */

function baseCookieOptions(maxAgeSeconds: number) {
  const env = getWebEnv();
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
    ...(env.WEB_COOKIE_DOMAIN ? { domain: env.WEB_COOKIE_DOMAIN } : {}),
  };
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const env = getWebEnv();
  return decryptPayload<SessionPayload>(raw, env.WEB_SESSION_SECRET);
}

/** Route Handler / Server Action only (cookie mutation is not allowed
 * during a Server Component render). */
export async function writeSession(payload: SessionPayload): Promise<void> {
  const env = getWebEnv();
  const token = await encryptPayload(payload, env.WEB_SESSION_SECRET, SESSION_MAX_AGE_SECONDS);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, baseCookieOptions(SESSION_MAX_AGE_SECONDS));
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function writeOAuthTransaction(payload: OAuthTransactionPayload): Promise<void> {
  const env = getWebEnv();
  const token = await encryptPayload(payload, env.WEB_SESSION_SECRET, OAUTH_TXN_MAX_AGE_SECONDS);
  const store = await cookies();
  store.set(OAUTH_TXN_COOKIE_NAME, token, baseCookieOptions(OAUTH_TXN_MAX_AGE_SECONDS));
}

export async function readOAuthTransaction(): Promise<OAuthTransactionPayload | null> {
  const store = await cookies();
  const raw = store.get(OAUTH_TXN_COOKIE_NAME)?.value;
  if (!raw) return null;
  const env = getWebEnv();
  return decryptPayload<OAuthTransactionPayload>(raw, env.WEB_SESSION_SECRET);
}

export async function clearOAuthTransaction(): Promise<void> {
  const store = await cookies();
  store.delete(OAUTH_TXN_COOKIE_NAME);
}

/**
 * Returns a guaranteed-fresh access token, silently refreshing it first if
 * fewer than REFRESH_SKEW_SECONDS remain — this is the "session refresh"
 * mechanism. Returns null if there's no session, or if the refresh token
 * itself is expired/revoked (Keycloak rejects the refresh grant), clearing
 * the (now-useless) session cookie in that case so the next request hits
 * middleware's unauthenticated redirect cleanly.
 *
 * Route Handler / Server Action only (writes cookies on refresh).
 */
export async function getValidAccessToken(): Promise<string | null> {
  const session = await readSession();
  if (!session) return null;

  const now = Math.floor(Date.now() / 1000);
  if (session.accessTokenExpiresAt - now > REFRESH_SKEW_SECONDS) {
    return session.accessToken;
  }

  if (session.refreshTokenExpiresAt <= now) {
    await clearSession();
    return null;
  }

  try {
    const tokens = await refreshTokens(session.refreshToken);
    const nowAfterRefresh = Math.floor(Date.now() / 1000);
    const nextSession: SessionPayload = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      idToken: tokens.id_token ?? session.idToken,
      accessTokenExpiresAt: nowAfterRefresh + (tokens.expiresIn() ?? 60),
      // Keycloak refresh-token rotation may extend the refresh token's own
      // lifetime too; if the grant didn't report a new expiry, keep the
      // previous one rather than guessing.
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
      subject: session.subject,
    };
    await writeSession(nextSession);
    return nextSession.accessToken;
  } catch {
    await clearSession();
    return null;
  }
}
