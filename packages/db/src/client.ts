import { PrismaClient } from '@prisma/client';
import { getRlsContext } from './rls-context';

/**
 * The RLS-aware Prisma client — the ONLY way application code should touch
 * the database. Call sites use it exactly like a normal PrismaClient
 * (`db.account.findMany()`); under the hood, every model operation is
 * transparently re-executed inside `$transaction(async (tx) => ...)` —
 * Prisma's INTERACTIVE transaction API, which pins one physical connection
 * for the callback's lifetime — with `set_config('app.*', value, true)`
 * (SET LOCAL semantics) run first on that same connection.
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
 */

let base: PrismaClient | undefined;

function basePrisma(): PrismaClient {
  if (!base) {
    base = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
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

function createRlsClient(): PrismaClient {
  const client = basePrisma();
  const modelCache = new Map<string, unknown>();

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string' || PASSTHROUGH_KEYS.has(prop)) {
        const passthroughValue = Reflect.get(target, prop, receiver);
        // Bind to `target` (the real PrismaClient), not left as a bare
        // reference: `getPrismaClient().$transaction(cb)` is a property
        // access + call in one expression, so per JS method-call semantics
        // `this` inside the retrieved function would otherwise be the
        // PROXY, not the real client — empirically confirmed to break
        // Prisma's interactive-transaction internals (a bare `$transaction`
        // call through this proxy fails engine-side with "missing field
        // `max_wait`", because default transaction options get looked up
        // via `this` and silently resolve to undefined against the proxy).
        // `$queryRaw`/`$executeRaw` called directly (no wrapping
        // `$transaction`) don't hit this, which is why health.controller.ts's
        // bare `$queryRaw` already worked — this fixes the case that didn't.
        return typeof passthroughValue === 'function' ? passthroughValue.bind(target) : passthroughValue;
      }
      const value = Reflect.get(target, prop, receiver);
      // Model delegates are plain objects (findMany/create/... methods);
      // everything else ($-prefixed or non-model) passes through untouched.
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
export function getPrismaClient(): PrismaClient {
  if (!singleton) {
    singleton = createRlsClient();
  }
  return singleton;
}

export { runWithRlsContext, getRlsContext, SYSTEM_JOB_CONTEXT } from './rls-context';
export type { RlsContext } from './rls-context';
export * from '@prisma/client';
