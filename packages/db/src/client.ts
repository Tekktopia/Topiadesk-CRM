import { PrismaClient } from '@prisma/client';
import { getRlsContext } from './rls-context';
import { TENANT_SCHEMA_NAME_PATTERN, tenantSchemaUrl } from './tenant-connection';

/**
 * The RLS-aware, schema-per-tenant Prisma client — the ONLY way application
 * code should touch the database. Call sites use it exactly like a normal
 * PrismaClient (`db.account.findMany()`); under the hood, every model
 * operation is transparently re-executed inside `$transaction(async (tx) =>
 * ...)` — Prisma's INTERACTIVE transaction API, which pins one physical
 * connection for the callback's lifetime — with `set_config('app.*', value,
 * true)` (SET LOCAL semantics) run first on that same connection.
 *
 * IMPORTANT — this went through a real, empirically-caught bug: an earlier
 * version tried the array/batch form, `$transaction([$executeRaw`SET...`,
 * query(args)])`, built from inside a `$allOperations` client extension.
 * That looked correct on paper (the Prisma docs describe batched
 * `$transaction` calls as running on one connection) but measurably did NOT
 * apply the session variables before the paired query executed — a broker
 * scoped to see 1 account saw 0. Do not reintroduce that pattern without
 * re-verifying against a real Postgres instance first; the interactive
 * `async (tx) => {...}` form below is the one confirmed to work (verified
 * via packages/db, see the RLS integration test).
 *
 * Cost: every Prisma call now costs 2 round trips instead of 1 (the
 * set_config call, then the real query, both inside one transaction). Be
 * disciplined about `select`/`include` — N+1 patterns are ~2x as expensive
 * here as in a non-RLS Prisma app.
 *
 * SCHEMA-PER-TENANT (Phase 2a): `getPrismaClient()` keeps its exact
 * zero-argument signature — every existing call site across the ~50+ files
 * that use it stays unmodified — but the PHYSICAL PrismaClient it proxies
 * to is now resolved fresh on every property access from
 * `getRlsContext()?.tenantSchema ?? 'public'`, via a keyed cache
 * (`physicalClients`) of one real PrismaClient per tenant schema. This is
 * safe for MODEL DELEGATE calls (`.account.findMany()`) because Prisma
 * bakes the schema into the generated SQL TEXT at client-construction time
 * (confirmed empirically via query logging: `new PrismaClient({
 * datasources: { db: { url: '...?schema=platform...' } } })` emits
 * `SELECT ... FROM "platform"."tenants" ...`, fully qualified) — that
 * qualification is immune to PgBouncer transparently swapping the physical
 * backend connection between transactions under `PGBOUNCER_POOL_MODE=
 * transaction`, since the schema is already in the query string, not
 * dependent on the connection's search_path at execution time.
 *
 * Hand-written raw SQL (`$queryRaw`/`$executeRaw`, the PASSTHROUGH_KEYS
 * branch below) is a DIFFERENT story: those queries reference tables
 * unqualified (e.g. `SELECT ... FROM loyalty_accounts ...`,
 * see loyalty/loyalty-ledger.util.ts), so they DO depend on the
 * connection's actual search_path at execution time. Confirmed empirically
 * (a throwaway spike, not shipped) that relying on `?schema=`'s "set
 * search_path on connect" behavior for this is UNSAFE under PgBouncer
 * transaction-mode pooling — interleaving two schema-scoped clients through
 * the shared pool produced ~44% cross-schema bleed (queries meant for one
 * tenant's raw SQL silently ran against another's search_path). The fix,
 * also confirmed empirically safe (0 failures across 120 interleaved
 * checks): `$transaction`'s passthrough wraps the caller's own callback to
 * issue `SET LOCAL search_path = <schema>, public` as the FIRST statement
 * on that pinned connection, before the caller's own callback (which does
 * its own unrelated `set_config` for RLS session vars, unchanged) ever
 * runs. `SET LOCAL` is transaction-scoped by Postgres's own guarantee —
 * reset automatically at COMMIT/ROLLBACK regardless of which physical
 * connection PgBouncer hands back to the pool — so it can never bleed into
 * a different tenant's later transaction the way relying on `?schema=`
 * alone did. This requires ZERO changes to any of the ~9 existing
 * `rls-raw-query.util.ts`-style call sites; they keep calling
 * `getPrismaClient().$transaction(async (tx) => {...})` exactly as before.
 */

const DEFAULT_SCHEMA = 'public';

const physicalClients = new Map<string, PrismaClient>();

function schemaPrisma(schemaName: string): PrismaClient {
  let client = physicalClients.get(schemaName);
  if (!client) {
    if (schemaName !== DEFAULT_SCHEMA && !TENANT_SCHEMA_NAME_PATTERN.test(schemaName)) {
      throw new Error(`Refusing to open a Prisma client for invalid schema "${schemaName}"`);
    }
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) throw new Error('DATABASE_URL is not set');
    const url = schemaName === DEFAULT_SCHEMA ? baseUrl : tenantSchemaUrl(baseUrl, schemaName);
    client = new PrismaClient({
      datasources: { db: { url } },
      log: process.env.DEBUG_SQL ? ['query', 'warn', 'error'] : process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    physicalClients.set(schemaName, client);
  }
  return client;
}

function currentSchema(): string {
  return getRlsContext()?.tenantSchema ?? DEFAULT_SCHEMA;
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

function wrapModelDelegate(modelName: string) {
  return new Proxy(
    {},
    {
      get(_target, method: string | symbol) {
        if (typeof method !== 'string') return undefined;
        return (...args: unknown[]) => {
          const ctx = getRlsContext();
          const client = schemaPrisma(currentSchema());
          type Delegate = Record<string, (...a: unknown[]) => unknown>;
          if (!ctx) {
            // No bound context: RLS-protected tables default-deny (fail
            // closed). Legitimate for internal/system scripts only —
            // request-handling code must always run inside an RLS context.
            const delegate = (client as unknown as Record<string, Delegate>)[modelName] as Delegate;
            return delegate[method]!(...args);
          }
          return client.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT
              set_config('app.current_user_id', ${ctx.userId}, true),
              set_config('app.current_role', ${ctx.role}, true),
              set_config('app.current_dept_id', ${ctx.departmentId ?? ''}, true),
              set_config('app.current_branch_id', ${ctx.branchId ?? ''}, true),
              set_config('app.current_client_ip', ${ctx.clientIp ?? ''}, true)`;
            const txDelegate = (tx as unknown as Record<string, Delegate>)[modelName] as Delegate;
            return txDelegate[method]!(...args);
          });
        };
      },
    },
  );
}

/**
 * `$transaction`'s passthrough is wrapped (not bound bare) specifically to
 * inject `SET LOCAL search_path` before the caller's own callback — see
 * this file's header comment. Every other PASSTHROUGH_KEYS member
 * ($queryRaw/$executeRaw/etc. called bare, outside a $transaction) is bound
 * straight to the resolved physical client; confirmed via repo-wide grep
 * that no such bare call references tenant-schema tables today (the one
 * real case, health.controller.ts's `SELECT 1`, has no table reference at
 * all, so which schema it runs against is immaterial).
 */
function wrapTransaction(client: PrismaClient, schemaName: string) {
  return (...args: unknown[]) => {
    const [callback, ...rest] = args as [(tx: unknown) => unknown, ...unknown[]];
    if (typeof callback !== 'function') {
      // The array/batch $transaction([...]) form — already documented above
      // as the one confirmed-broken-for-set_config shape; nothing here
      // depends on it, so it passes through untouched rather than guessing
      // at how to inject search_path into it.
      return (client.$transaction as (...a: unknown[]) => unknown)(...args);
    }
    return client.$transaction(async (tx) => {
      // Identifier can't be bind-parameterized; schemaName is validated
      // against TENANT_SCHEMA_NAME_PATTERN (or the DEFAULT_SCHEMA literal)
      // in schemaPrisma() before it ever reaches here.
      await (tx as { $executeRawUnsafe: (sql: string) => Promise<number> }).$executeRawUnsafe(`SET LOCAL search_path = ${schemaName}, public`);
      return callback(tx);
    }, ...(rest as []));
  };
}

function createRlsClient(): PrismaClient {
  const modelCache = new Map<string, unknown>();

  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;

      if (PASSTHROUGH_KEYS.has(prop)) {
        const schemaName = currentSchema();
        const client = schemaPrisma(schemaName);
        if (prop === '$transaction') return wrapTransaction(client, schemaName);
        const value = (client as unknown as Record<string, unknown>)[prop];
        // Bind to `client` (the real PrismaClient), not left bare — see
        // packages/db/src/client.ts's git history for the empirically-
        // confirmed footgun this avoids (Prisma's interactive-transaction
        // internals resolve default options via `this`, which breaks if
        // it's ever a Proxy instead of the real client).
        return typeof value === 'function' ? value.bind(client) : value;
      }

      // Model delegates are plain objects (findMany/create/... methods);
      // everything else ($-prefixed or non-model) passes through above.
      if (!modelCache.has(prop)) {
        modelCache.set(prop, wrapModelDelegate(prop));
      }
      return modelCache.get(prop);
    },
  });
}

let singleton: PrismaClient | undefined;

/** Process-wide singleton — do not construct PrismaClient anywhere else. */
export function getPrismaClient(): PrismaClient {
  if (!singleton) {
    singleton = createRlsClient();
  }
  return singleton;
}

export { runWithRlsContext, getRlsContext, SYSTEM_JOB_CONTEXT } from './rls-context';
export type { RlsContext } from './rls-context';
export * from './tenant-connection';
export * from '@prisma/client';
