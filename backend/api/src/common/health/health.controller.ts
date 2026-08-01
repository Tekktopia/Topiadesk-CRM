import { Controller, Get } from '@nestjs/common';
// HealthCheckService is NOT a type-only import: it's constructor-injected
// below, and controllers are resolved through Nest's DI container the same
// as any provider — see permission.guard.ts's comment on the same footgun.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { HealthCheck, HealthCheckService, type HealthIndicatorFunction } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';

/**
 * Liveness (`/health`) vs readiness (`/ready`) are deliberately different
 * checks — this is load-bearing, not stylistic. Liveness MUST NOT check
 * dependencies: if it did, a brief Postgres blip would cause every API
 * replica's liveness probe to fail simultaneously and get restarted,
 * turning a transient blip into a full outage. Readiness checks
 * dependencies and drives traffic routing (a not-ready pod stops receiving
 * new requests but is not killed).
 *
 * Extension point: add Redis/MinIO indicators to `ready()` once those
 * clients exist (Batch 1 — documents/notifications modules) — deliberately
 * not stubbed here with an always-true check, which would be a false
 * positive readiness signal.
 */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get('health')
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    const checkDatabase: HealthIndicatorFunction = async () => {
      await getPrismaClient().$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    };
    return this.health.check([checkDatabase]);
  }
}
