import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, Headers, NotFoundException, Param, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type Prisma } from '@topiadesk/db';

/**
 * Inbound receiver for IntegrationConnector.webhookPath — a schema field
 * that already existed with no consuming route (confirmed gap per the
 * build brief). Authenticated via a per-connector shared secret stored in
 * IntegrationConnector.config.webhookSecret, checked against the
 * `x-webhook-secret` header — same shared-secret-header pattern as
 * KeycloakWebhookGuard (keycloak-webhook.guard.ts), just keyed per-row
 * instead of one global env var, since there can be many connectors each
 * needing their own secret (and connectors are admin-managed data, not
 * bootstrap config, so a per-row secret is the right level).
 *
 * Records the payload via the SAME SyncJob/IntegrationLog framework
 * integrations.service.ts's outbound sync already uses, rather than just
 * accepting and discarding the body — an inbound push is exactly as real a
 * sync event as an outbound poll.
 *
 * Excluded from RlsContextMiddleware in app.module.ts (integration-pass
 * follow-up — exact path is in this module's final report): the caller is
 * an external system with no TopiaDesk-issued JWT, so this wraps its body
 * in runWithRlsContext(SYSTEM_JOB_CONTEXT, ...), the same reason and
 * pattern as keycloak-webhook.controller.ts.
 */
@ApiTags('integrations')
@Controller('integrations/webhooks')
export class WebhookReceiverController {
  @Post(':webhookPath')
  receive(
    @Param('webhookPath') webhookPath: string,
    @Headers('x-webhook-secret') providedSecret: string | undefined,
    @Body() body: unknown,
  ): Promise<{ status: string }> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.process(webhookPath, providedSecret, body));
  }

  private async process(webhookPath: string, providedSecret: string | undefined, body: unknown): Promise<{ status: string }> {
    const prisma = getPrismaClient();
    const connector = await prisma.integrationConnector.findUnique({ where: { webhookPath } });
    if (!connector) throw new NotFoundException('Unknown webhook path');
    if (!connector.isEnabled) throw new BadRequestException('Connector is disabled');

    const config = connector.config as { webhookSecret?: string } | null;
    if (!config?.webhookSecret || !providedSecret || providedSecret !== config.webhookSecret) {
      throw new UnauthorizedException('Invalid or missing webhook secret');
    }

    const syncJob = await prisma.syncJob.create({
      data: {
        connectorId: connector.id,
        jobType: 'INBOUND_WEBHOOK',
        status: 'SUCCEEDED',
        startedAt: new Date(),
        completedAt: new Date(),
        recordsProcessed: 1,
        recordsSucceeded: 1,
        correlationId: randomUUID(),
      },
    });

    await prisma.integrationLog.create({
      data: {
        syncJobId: syncJob.id,
        connectorId: connector.id,
        level: 'INFO',
        category: 'SYNC',
        message: `Inbound webhook received on path "${webhookPath}"`,
        payloadSnapshot: (body ?? {}) as Prisma.InputJsonValue,
      },
    });

    await prisma.integrationConnector.update({ where: { id: connector.id }, data: { lastSuccessfulSyncAt: new Date() } });

    return { status: 'ok' };
  }
}
