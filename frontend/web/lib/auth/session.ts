import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { getWebEnv } from '../env';
import {
  CSRF_COOKIE_NAME,
  OAUTH_TXN_COOKIE_NAME,
  OAUTH_TXN_MAX_AGE_SECONDS,
  REFRESH_SKEW_SECONDS,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from './constants';
import { decryptPayload, encryptPayload } from './crypto';
import { refreshTokens } from './oidc';
import { deleteStoredSession, getStoredSession, setStoredSession } from './redis-session-store';
import type { OAuthTransactionPayload, SessionCookiePayload, SessionPayload } from './types';

export { SESSION_COOKIE_NAME, OAUTH_TXN_COOKIE_NAME };

/**
 * Server-only cookie session management.
 *
 * Two cookies, both HttpOnly + encrypted (AES-256-GCM via `./crypto.ts`,
 * keyed off WEB_SESSION_SECRET) — tokens are never exposed to JS and never
 * touch localStorage/sessionStorage, per the compliance requirement that
 * XSS can't exfiltrate them:
 *
 *  - `td_session`: not the real session — an opaque `{sessionId}` envelope
 *    (SessionCookiePayload). The real access/refresh/ID tokens
 *    (SessionPayload) live server-side in Redis (./redis-session-store.ts),
 *    looked up by sessionId on every read. Three full Keycloak JWTs
 *    together routinely exceed the ~4096-byte limit browsers enforce on a
 *    single cookie, which — before this — silently broke login in every
 *    real browser (see types.ts's doc comment on SessionPayload).
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
 * top-of-file comment for why). middleware.ts only ever decrypts the small
 * cookie envelope to confirm a non-tampered session pointer exists; it has
 * no Redis/TCP access on the Edge runtime and doesn't need one.
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

async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const env = getWebEnv();
  const envelope = await decryptPayload<SessionCookiePayload>(raw, env.WEB_SESSION_SECRET);
  return envelope?.sessionId ?? null;
}

export async function readSession(): Promise<SessionPayload | null> {
  const sessionId = await readSessionId();
  if (!sessionId) return null;
  return getStoredSession(sessionId);
}

/** Route Handler / Server Action only (cookie mutation is not allowed
 * during a Server Component render). Pass `existingSessionId` on a token
 * refresh to overwrite the same Redis entry/cookie envelope rather than
 * minting a new one for what's still logically the same session. */
export async function writeSession(payload: SessionPayload, existingSessionId?: string): Promise<void> {
  const sessionId = existingSessionId ?? randomUUID();
  await setStoredSession(sessionId, payload, SESSION_MAX_AGE_SECONDS);

  const env = getWebEnv();
  const envelope: SessionCookiePayload = { sessionId };
  const token = await encryptPayload(envelope, env.WEB_SESSION_SECRET, SESSION_MAX_AGE_SECONDS);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, baseCookieOptions(SESSION_MAX_AGE_SECONDS));

  // Re-minted on every refresh too, not just fresh login — harmless (the
  // client always just echoes back whatever's currently in the cookie) and
  // simpler than threading "is this actually a new session" through here.
  const csrfOptions = { ...baseCookieOptions(SESSION_MAX_AGE_SECONDS), httpOnly: false };
  store.set(CSRF_COOKIE_NAME, randomUUID(), csrfOptions);
}

export async function clearSession(): Promise<void> {
  const sessionId = await readSessionId();
  if (sessionId) await deleteStoredSession(sessionId);
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  store.delete(CSRF_COOKIE_NAME);
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
 * Collapses concurrent refreshes for the same session into one shared
 * in-flight request. A single page (e.g. the dashboard) fires a dozen
 * parallel BFF calls; if the access token is near expiry, every one of
 * them independently observed that and would otherwise call
 * refreshTokens() with the same refresh token at once. Keycloak rotates
 * refresh tokens on use, so only the first of those would succeed — every
 * other concurrent refresh would be rejected with invalid_grant and fall
 * into the catch below, which called clearSession() and wiped out the
 * session the winning request had just written. That raced as a burst of
 * 401s across every endpoint on the page, followed by the user's session
 * actually being gone. See ADR/incident note: freeze recurrence, 2026-08.
 */
const inFlightRefreshes = new Map<string, Promise<string | null>>();

async function refreshAndStore(sessionId: string, session: SessionPayload): Promise<string | null> {
  try {
    const tokens = await refreshTokens(session.realm, session.refreshToken);
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
      realm: session.realm,
    };
    await writeSession(nextSession, sessionId);
    return nextSession.accessToken;
  } catch {
    await clearSession();
    return null;
  }
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
  const sessionId = await readSessionId();
  if (!sessionId) return null;
  const session = await getStoredSession(sessionId);
  if (!session) return null;

  const now = Math.floor(Date.now() / 1000);
  if (session.accessTokenExpiresAt - now > REFRESH_SKEW_SECONDS) {
    return session.accessToken;
  }

  if (session.refreshTokenExpiresAt <= now) {
    await clearSession();
    return null;
  }

  const existing = inFlightRefreshes.get(sessionId);
  if (existing) return existing;

  const refreshPromise = refreshAndStore(sessionId, session).finally(() => {
    inFlightRefreshes.delete(sessionId);
  });
  inFlightRefreshes.set(sessionId, refreshPromise);
  return refreshPromise;
}
