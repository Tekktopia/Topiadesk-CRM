import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { getGlobalAdminEnv } from '../env';
import { OAUTH_TXN_COOKIE_NAME, OAUTH_TXN_MAX_AGE_SECONDS, REFRESH_SKEW_SECONDS, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './constants';
import { decryptPayload, encryptPayload } from './crypto';
import { refreshTokens } from './oidc';
import { deleteStoredSession, getStoredSession, setStoredSession } from './redis-session-store';
import type { OAuthTransactionPayload, SessionCookiePayload, SessionPayload } from './types';

export { SESSION_COOKIE_NAME, OAUTH_TXN_COOKIE_NAME };

/**
 * Server-only cookie session management — a direct copy of frontend/web/
 * lib/auth/session.ts's design (see that file's header comment for the
 * full reasoning: opaque session-ID cookie + real tokens in Redis, HttpOnly
 * + AES-256-GCM encrypted, `secure`/`domain` only applied in production).
 */
function baseCookieOptions(maxAgeSeconds: number) {
  const env = getGlobalAdminEnv();
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
  const env = getGlobalAdminEnv();
  const envelope = await decryptPayload<SessionCookiePayload>(raw, env.GLOBAL_ADMIN_SESSION_SECRET);
  return envelope?.sessionId ?? null;
}

export async function readSession(): Promise<SessionPayload | null> {
  const sessionId = await readSessionId();
  if (!sessionId) return null;
  return getStoredSession(sessionId);
}

export async function writeSession(payload: SessionPayload, existingSessionId?: string): Promise<void> {
  const sessionId = existingSessionId ?? randomUUID();
  await setStoredSession(sessionId, payload, SESSION_MAX_AGE_SECONDS);

  const env = getGlobalAdminEnv();
  const envelope: SessionCookiePayload = { sessionId };
  const token = await encryptPayload(envelope, env.GLOBAL_ADMIN_SESSION_SECRET, SESSION_MAX_AGE_SECONDS);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, baseCookieOptions(SESSION_MAX_AGE_SECONDS));
}

export async function clearSession(): Promise<void> {
  const sessionId = await readSessionId();
  if (sessionId) await deleteStoredSession(sessionId);
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function writeOAuthTransaction(payload: OAuthTransactionPayload): Promise<void> {
  const env = getGlobalAdminEnv();
  const token = await encryptPayload(payload, env.GLOBAL_ADMIN_SESSION_SECRET, OAUTH_TXN_MAX_AGE_SECONDS);
  const store = await cookies();
  store.set(OAUTH_TXN_COOKIE_NAME, token, baseCookieOptions(OAUTH_TXN_MAX_AGE_SECONDS));
}

export async function readOAuthTransaction(): Promise<OAuthTransactionPayload | null> {
  const store = await cookies();
  const raw = store.get(OAUTH_TXN_COOKIE_NAME)?.value;
  if (!raw) return null;
  const env = getGlobalAdminEnv();
  return decryptPayload<OAuthTransactionPayload>(raw, env.GLOBAL_ADMIN_SESSION_SECRET);
}

export async function clearOAuthTransaction(): Promise<void> {
  const store = await cookies();
  store.delete(OAUTH_TXN_COOKIE_NAME);
}

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

  try {
    const tokens = await refreshTokens(session.refreshToken);
    const nowAfterRefresh = Math.floor(Date.now() / 1000);
    const nextSession: SessionPayload = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      idToken: tokens.id_token ?? session.idToken,
      accessTokenExpiresAt: nowAfterRefresh + (tokens.expiresIn() ?? 60),
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
      subject: session.subject,
    };
    await writeSession(nextSession, sessionId);
    return nextSession.accessToken;
  } catch {
    await clearSession();
    return null;
  }
}
