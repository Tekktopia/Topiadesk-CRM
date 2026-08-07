// NOT '@prisma/client' — see prisma/schema.prisma's generator block comment:
// this schema generates to a package-local `../generated/client` path
// specifically to avoid colliding with packages/db's tenant-schema client
// in pnpm's shared virtual store.
import { PrismaClient } from '../generated/client';
import { getRlsContext } from '@topiadesk/db';

/**
 * The RLS-aware Prisma client for the PLATFORM schema — deliberately a
 * separate Prisma project from packages/db (`@topiadesk/db`), not extra
 * models bolted onto it: the platform schema holds exactly one instance's
 * worth of control-plane data (Tenant/Plan/Subscription/PlatformAdminUser/
 * TenantProvisioningEvent) shared across the whole product, structurally
 * unrelated to any one tenant's CRM data, and generated from `?schema=
 * platform` so its client emits `"platform"."tenants"` etc. — see this
 * package's `prisma/schema.prisma` datasource block.
 *
 * Reuses `getRlsContext()`/`runWithRlsContext()`/`SYSTEM_JOB_CONTEXT` from
 * `@topiadesk/db` rather than a second AsyncLocalStorage instance — the
 * SAME bound RlsContext (userId/role) is meaningful here too (a platform
 * admin's session, or SYSTEM_JOB for the tenant-provisioning worker), and
 * a request/job only ever touches ONE of {tenant schema, platform schema}
 * in practice, so sharing the context type is simpler than duplicating it.
 *
 * Wrapping shape (interactive $transaction + SET LOCAL before the real
 * query, on the SAME pinned connection) is copied verbatim from
 * packages/db/src/client.ts — see that file's header comment for the real,
 * empirically-caught bug (the array/batch `$transaction([...])` form) that
 * makes this the only form to use. Only sets the 2 session vars the
 * platform schema's RLS policies actually read
 * (platform_current_user_id()/platform_current_role(), see
 * prisma/rls/002_policies.sql) — no department/branch/client-ip concept
 * exists at the platform level.
 */

let base: PrismaClient | undefined;

function basePrisma(): PrismaClient {
  if (!base) {
    base = new PrismaClient({
      log: process.env.DEBUG_SQL ? ['query', 'warn', 'error'] : process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return base;
}

const PASSTHROUGH_KEYS = new Set([
  '$connect',
  '$disconnect',
  '$on',
  '$use',
  '$extends',
  '$transaction',
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
]);

function wrapModelDelegate(client: PrismaClient, modelName: string) {
  return new Proxy(
    {},
    {
      get(_target, method: string | symbol) {
        if (typeof method !== 'string') return undefined;
        return (...args: unknown[]) => {
          const ctx = getRlsContext();
          type Delegate = Record<string, (...a: unknown[]) => unknown>;
          if (!ctx) {
            // No bound context: RLS-protected tables default-deny (fail
            // closed) — same "internal/system scripts only" carve-out as
            // packages/db/src/client.ts.
            const delegate = (client as unknown as Record<string, Delegate>)[modelName] as Delegate;
            return delegate[method]!(...args);
          }
          return client.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT
              set_config('app.current_user_id', ${ctx.userId}, true),
              set_config('app.current_role', ${ctx.role}, true)`;
            const txDelegate = (tx as unknown as Record<string, Delegate>)[modelName] as Delegate;
            return txDelegate[method]!(...args);
          });
        };
      },
    },
  );
}

function createRlsClient(): PrismaClient {
  const client = basePrisma();
  const modelCache = new Map<string, unknown>();

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string' || PASSTHROUGH_KEYS.has(prop)) {
        const passthroughValue = Reflect.get(target, prop, receiver);
        // Bound to `target`, not left bare — same footgun documented in
        // packages/db/src/client.ts (Prisma's interactive-transaction
        // internals break if `this` resolves to the Proxy instead of the
        // real client).
        return typeof passthroughValue === 'function' ? passthroughValue.bind(target) : passthroughValue;
      }
      const value = Reflect.get(target, prop, receiver);
      if (value !== null && typeof value === 'object') {
        if (!modelCache.has(prop)) {
          modelCache.set(prop, wrapModelDelegate(client, prop));
        }
        return modelCache.get(prop);
      }
      return value;
    },
  }) as PrismaClient;
}

let singleton: PrismaClient | undefined;

/** Process-wide singleton — do not construct PrismaClient anywhere else. */
export function getPlatformPrismaClient(): PrismaClient {
  if (!singleton) {
    singleton = createRlsClient();
  }
  return singleton;
}

export * from '../generated/client';
