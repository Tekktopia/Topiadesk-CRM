import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';

const CACHE_KEY_PREFIX = 'tenant-realm:';
// Same "short TTL, not perfect invalidation" reasoning as
// identity/ip-whitelist-cache.ts — a missed invalidateTenantRealmCache()
// call (a second api replica, a direct DB edit) still becomes effective
// within this window. 30s bounds how long a suspended tenant's users can
// keep working after Global Admin flips the switch — "reasonably prompt",
// not instant.
const CACHE_TTL_SECONDS = 30;

let redisClient: Redis | undefined;

function getRedisClient(): Redis {
  if (!redisClient) {
    const env = loadEnv();
    redisClient = new Redis(env.REDIS_URL, {
      retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
      maxRetriesPerRequest: 3,
    });
    redisClient.on('error', (err) => {
      console.error('[tenant-realm-resolver] Redis connection error:', err.message);
    });
  }
  return redisClient;
}

export interface ResolvedTenant {
  id: string;
  schemaName: string;
  status: string;
}

/**
 * Resolves a Keycloak realm name to its Tenant row — this is the live
 * suspension-enforcement lookup RlsContextMiddleware calls on every
 * request, AFTER the token's signature is already verified (see that
 * file). Redis-cached (EX 30s); on a cache miss or any Redis error, fails
 * OPEN to a direct `getPlatformPrismaClient().tenant.findUnique()` under
 * SYSTEM_JOB_CONTEXT — same "a cache outage must not silently lock
 * everyone out" reasoning as identity/ip-whitelist-cache.ts, applied here
 * to the platform schema instead of the tenant schema.
 *
 * Returns `null` if no Tenant row matches the realm at all — the caller
 * (RlsContextMiddleware) treats this identically to a suspended tenant
 * (403), since an unregistered realm has no business issuing tokens this
 * API should trust past signature verification.
 */
export async function resolveActiveTenantByRealm(realmName: string): Promise<ResolvedTenant | null> {
  const cacheKey = `${CACHE_KEY_PREFIX}${realmName}`;
  try {
    const cached = await getRedisClient().get(cacheKey);
    if (cached) return JSON.parse(cached) as ResolvedTenant;
  } catch (err) {
    console.error('[tenant-realm-resolver] Redis read failed, falling back to direct DB read:', err instanceof Error ? err.message : String(err));
  }

  const tenant = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
    getPlatformPrismaClient().tenant.findUnique({
      where: { keycloakRealm: realmName },
      select: { id: true, schemaName: true, status: true },
    }),
  );
  const resolved: ResolvedTenant | null = tenant ? { id: tenant.id, schemaName: tenant.schemaName, status: tenant.status } : null;

  try {
    // Cache the negative result too (an unregistered realm doesn't become
    // registered mid-request-storm) — same TTL, so a brand-new tenant's
    // first request is at most CACHE_TTL_SECONDS behind its own
    // provisioning completing, never permanently stuck.
    await getRedisClient().set(cacheKey, JSON.stringify(resolved), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    console.error('[tenant-realm-resolver] Redis write failed (non-fatal, request proceeds with the DB-read value):', err instanceof Error ? err.message : String(err));
  }

  return resolved;
}

/** Called from platform/tenants.controller.ts's suspend/reactivate handlers so a status change is effective immediately, not after CACHE_TTL_SECONDS. */
export async function invalidateTenantRealmCache(realmName: string): Promise<void> {
  try {
    await getRedisClient().del(`${CACHE_KEY_PREFIX}${realmName}`);
  } catch (err) {
    console.error('[tenant-realm-resolver] Redis invalidation failed (non-fatal — the short TTL still bounds staleness):', err instanceof Error ? err.message : String(err));
  }
}
