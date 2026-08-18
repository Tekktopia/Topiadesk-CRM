import { ConflictException, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getRlsContext } from '@topiadesk/db';
import { from, of, switchMap, tap, type Observable } from 'rxjs';

/**
 * Replay-safe mutations, for the offline PWA's write outbox.
 *
 * A field agent's phone queues writes while offline and replays them on
 * reconnect. The failure mode that makes replay dangerous is not "the
 * request never arrived" — it's "the request arrived, the server committed
 * it, and the response was lost on the way back", which on a phone moving
 * between cells is ordinary rather than exotic. Replaying that blindly
 * creates a duplicate account/case/activity, and this codebase had no
 * general protection: the existing `dedupeKey` columns cover notification
 * and delivery rows only, never a user-initiated CRM write.
 *
 * A client sends `Idempotency-Key: <uuid>` on a mutation. The first request
 * executes normally and its status+body are recorded; any later request
 * carrying the same key returns that recorded response WITHOUT re-running
 * the handler.
 *
 * Redis rather than a table, deliberately: keys only need to outlive a
 * plausible retry window (see IDEMPOTENCY_TTL_SECONDS), so a per-tenant
 * SQL table would grow forever to store rows that stop mattering within a
 * day, and would need its own migration across every tenant schema plus a
 * reaper job. Redis expiry is the whole feature for free, and this codebase
 * already uses exactly this client/retry shape elsewhere (see
 * common/auth/tenant-realm-resolver.ts).
 *
 * Requests WITHOUT the header are passed straight through, so this is
 * additive — no existing client behaviour changes.
 */

// A day comfortably covers an agent who loses signal in the field and only
// reconnects the next morning, while bounding how long a stale key can
// suppress a genuinely-new request the user meant to make twice.
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const IN_FLIGHT = '__in_flight__';
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

interface RecordedResponse {
  status: number;
  body: unknown;
}

let redisClient: Redis | undefined;

function getRedisClient(): Redis {
  if (!redisClient) {
    const env = loadEnv();
    redisClient = new Redis(env.REDIS_URL, {
      retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
      maxRetriesPerRequest: 3,
    });
    redisClient.on('error', (err) => {
      console.error('[idempotency] Redis connection error:', err.message);
    });
  }
  return redisClient;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!MUTATING_METHODS.has(req.method)) return next.handle();

    const rawKey = req.header('Idempotency-Key');
    if (!rawKey) return next.handle();

    // Namespaced by tenant AND user: a key is only ever a promise about the
    // caller's own retry, so one user must never be able to read back
    // another's recorded response by guessing (or reusing) a key.
    const tenantSchema = getRlsContext()?.tenantSchema ?? 'public';
    const userId = req.user?.id ?? 'anonymous';
    const cacheKey = `idem:${tenantSchema}:${userId}:${rawKey}`;

    return from(this.claim(cacheKey)).pipe(
      switchMap((existing) => {
        if (existing) {
          const res = context.switchToHttp().getResponse<Response>();
          res.status(existing.status);
          // Lets a client (and anyone reading logs) tell a replay from a
          // fresh write — the outbox uses this to report "already applied"
          // rather than claiming it just created something.
          res.setHeader('Idempotent-Replay', 'true');
          return of(existing.body);
        }
        return next.handle().pipe(
          tap({
            next: (body) => {
              const status = context.switchToHttp().getResponse<Response>().statusCode;
              void this.record(cacheKey, { status, body });
            },
            // A failed write is NOT recorded: the client should be free to
            // retry the same key after fixing whatever went wrong, and a
            // cached 500 would otherwise pin that failure for a full day.
            error: () => void getRedisClient().del(cacheKey).catch(() => undefined),
          }),
        );
      }),
    );
  }

  /**
   * Atomically claims the key or reports what's already there. `SET NX`
   * makes the claim race-free, which matters because a flaky connection
   * produces genuinely concurrent duplicates, not just sequential ones.
   */
  private async claim(cacheKey: string): Promise<RecordedResponse | null> {
    const redis = getRedisClient();
    const claimed = await redis.set(cacheKey, IN_FLIGHT, 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');
    if (claimed === 'OK') return null;

    const existing = await redis.get(cacheKey);
    if (existing === IN_FLIGHT) {
      // The original is still running. Returning its eventual response
      // would mean holding this request open on a poll loop; a 409 tells
      // the outbox to leave the item queued and try again shortly, which
      // is both simpler and honest about what happened.
      throw new ConflictException('A request with this Idempotency-Key is still in progress. Retry shortly.');
    }
    if (!existing) return null; // expired between SET NX and GET — treat as fresh
    try {
      return JSON.parse(existing) as RecordedResponse;
    } catch {
      return null;
    }
  }

  private async record(cacheKey: string, response: RecordedResponse): Promise<void> {
    try {
      await getRedisClient().set(cacheKey, JSON.stringify(response), 'EX', IDEMPOTENCY_TTL_SECONDS);
    } catch (err) {
      // Losing the record only costs replay protection for this one key —
      // never worth failing a write the server already committed.
      console.error('[idempotency] failed to record response:', err instanceof Error ? err.message : err);
    }
  }
}
