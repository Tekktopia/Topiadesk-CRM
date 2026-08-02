import 'server-only';
import Redis from 'ioredis';
import { getWebEnv } from '../env';
import type { SessionPayload } from './types';

/**
 * Server-side session store — the real SessionPayload (access/refresh/ID
 * tokens) lives here, not in the browser cookie (see types.ts's
 * SessionCookiePayload doc comment for why). Same Redis instance
 * api/worker already depend on; `websession:` prefixes every key so
 * nothing here can collide with BullMQ's own `bull:`-prefixed keys.
 *
 * Node runtime only (ioredis needs raw TCP, unavailable on the Edge
 * runtime) — imported only from session.ts, which route handlers/server
 * actions use, never from middleware.ts.
 */
let client: Redis | undefined;

function getClient(): Redis {
  if (!client) {
    const env = getWebEnv();
    client = new Redis(env.REDIS_URL, {
      // A Route Handler shouldn't hang indefinitely if Redis is down —
      // fail the request in seconds, not never, rather than mirroring
      // worker's `maxRetriesPerRequest: null` (correct for BullMQ's
      // blocking calls, wrong for a request/response read/write here).
      maxRetriesPerRequest: 3,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });
  }
  return client;
}

function key(sessionId: string): string {
  return `websession:${sessionId}`;
}

export async function getStoredSession(sessionId: string): Promise<SessionPayload | null> {
  const raw = await getClient().get(key(sessionId));
  if (!raw) return null;
  return JSON.parse(raw) as SessionPayload;
}

export async function setStoredSession(sessionId: string, payload: SessionPayload, ttlSeconds: number): Promise<void> {
  await getClient().set(key(sessionId), JSON.stringify(payload), 'EX', ttlSeconds);
}

export async function deleteStoredSession(sessionId: string): Promise<void> {
  await getClient().del(key(sessionId));
}
