import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type IpWhitelistEntry } from '@topiadesk/db';

const CACHE_KEY = 'ip-whitelist:active-entries';
// Short TTL, not "cache forever + invalidate perfectly" — matches the task
// brief's own framing ("short TTL"). A whitelist change made outside this
// process (a second api replica, a direct DB edit) becomes effective within
// this window even if THIS process's invalidateCache() call is missed for
// any reason; deliberately bounds the blast radius of a missed invalidation
// rather than depending on invalidation being flawless.
const CACHE_TTL_SECONDS = 30;

let redisClient: Redis | undefined;

/**
 * backend/api doesn't otherwise depend on Redis directly (only backend/
 * worker does, via ioredis — see backend/worker/src/main.ts). Lazily
 * constructed (not connected at import time) so modules that never touch
 * IP whitelist enforcement never pay for a Redis connection.
 */
function getRedisClient(): Redis {
  if (!redisClient) {
    const env = loadEnv();
    redisClient = new Redis(env.REDIS_URL, {
      retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
      // Bounded (unlike worker's `null`, which is required there for
      // BullMQ's blocking commands) — this is plain GET/SET/DEL traffic, so
      // a request should fail over to the DB read below rather than hang
      // indefinitely if Redis is unreachable.
      maxRetriesPerRequest: 3,
    });
    redisClient.on('error', (err) => {
      console.error('[ip-whitelist-cache] Redis connection error:', err.message);
    });
  }
  return redisClient;
}

/**
 * Reads the active IpWhitelistEntry set from Redis; on a cache miss (or any
 * Redis error — fails OPEN to a direct DB read, not closed to "nothing
 * whitelisted", since this cache sits in front of a security control and a
 * Redis outage must not silently lock every role out) queries Postgres
 * under SYSTEM_JOB (ip_whitelist_entries carries no RLS policy — confirmed
 * via `grep ip_whitelist_entries prisma/rls/*.sql` returning nothing, same
 * as departments/branches/org_settings — but a model-delegate call still
 * needs SOME bound RLS context to route through getPrismaClient()'s Proxy
 * correctly) and repopulates the cache.
 */
export async function getActiveIpWhitelistEntries(): Promise<IpWhitelistEntry[]> {
  try {
    const cached = await getRedisClient().get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as IpWhitelistEntry[];
  } catch (err) {
    console.error('[ip-whitelist-cache] Redis read failed, falling back to direct DB read:', err instanceof Error ? err.message : String(err));
  }

  const entries = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
    getPrismaClient().ipWhitelistEntry.findMany({ where: { isActive: true } }),
  );

  try {
    await getRedisClient().set(CACHE_KEY, JSON.stringify(entries), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    console.error('[ip-whitelist-cache] Redis write failed (non-fatal, request proceeds with the DB-read value):', err instanceof Error ? err.message : String(err));
  }

  return entries;
}

/** Called from ip-whitelist.controller.ts's create/update/delete handlers so a change is effective immediately, not after CACHE_TTL_SECONDS. */
export async function invalidateIpWhitelistCache(): Promise<void> {
  try {
    await getRedisClient().del(CACHE_KEY);
  } catch (err) {
    console.error('[ip-whitelist-cache] Redis invalidation failed (non-fatal — the short TTL still bounds staleness):', err instanceof Error ? err.message : String(err));
  }
}
