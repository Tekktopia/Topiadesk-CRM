import 'server-only';
import Redis from 'ioredis';
import { getGlobalAdminEnv } from '../env';
import type { SessionPayload } from './types';

/**
 * Server-side session store — same Redis instance api/worker/web already
 * depend on, `gadminsession:` prefixed (distinct from web's `websession:`
 * and BullMQ's `bull:`) so keys can never collide across apps. See
 * frontend/web/lib/auth/redis-session-store.ts for the full reasoning.
 */
let client: Redis | undefined;

function getClient(): Redis {
  if (!client) {
    const env = getGlobalAdminEnv();
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });
  }
  return client;
}

function key(sessionId: string): string {
  return `gadminsession:${sessionId}`;
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
