import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, Headers, NotFoundException, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type Prisma } from '@topiadesk/db';
// NOT a type-only import: constructor-injected below — see the same
// footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PaystackService } from './paystack.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ESignatureService } from './esignature.service';

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
  constructor(
    private readonly paystack: PaystackService,
    private readonly esignature: ESignatureService,
  ) {}

  @Post(':webhookPath')
  receive(
    @Param('webhookPath') webhookPath: string,
    @Headers('x-webhook-secret') providedSecret: string | undefined,
    @Headers('x-paystack-signature') paystackSignature: string | undefined,
    @Body() body: unknown,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ status: string }> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      this.process(webhookPath, providedSecret, paystackSignature, req.rawBody, body),
    );
  }

  private async process(
    webhookPath: string,
    providedSecret: string | undefined,
    paystackSignature: string | undefined,
    rawBody: Buffer | undefined,
    body: unknown,
  ): Promise<{ status: string }> {
    const prisma = getPrismaClient();
    const connector = await prisma.integrationConnector.findUnique({ where: { webhookPath } });
    if (!connector) throw new NotFoundException('Unknown webhook path');
    if (!connector.isEnabled) throw new BadRequestException('Connector is disabled');

    if (connector.connectorType === 'PAYSTACK') {
      this.verifyPaystackSignature(connector.config, paystackSignature, rawBody);
    } else {
      // Generic per-connector shared-secret check — every OTHER connector
      // type still uses this (see this class's own header comment). Real
      // per-vendor signature verification (DocuSign Connect's own HMAC
      // header, etc.) is a real, flagged follow-up beyond Paystack's,
      // which this pass prioritized since Paystack handles money.
      const config = connector.config as { webhookSecret?: string } | null;
      if (!config?.webhookSecret || !providedSecret || providedSecret !== config.webhookSecret) {
        throw new UnauthorizedException('Invalid or missing webhook secret');
      }
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

    // Type-specific business logic beyond the generic log-and-record above
    // — DOJAH/WHATSAPP_CLOUD are action-triggered (verify-on-demand,
    // send-on-demand), not webhook-triggered, so they have no dispatch
    // branch here.
    if (connector.connectorType === 'PAYSTACK') {
      await this.paystack.handleWebhookPayload(connector.id, body);
    } else if (connector.connectorType === 'DOCUSIGN') {
      await this.esignature.handleWebhookPayload(connector.id, body);
    }

    return { status: 'ok' };
  }

  /**
   * Paystack's real, documented webhook auth scheme: HMAC-SHA512 of the
   * EXACT raw request body, keyed by the connector's own secretKey,
   * compared against the `x-paystack-signature` header — not the generic
   * per-connector shared-secret this controller uses for every other
   * vendor (see class header comment). `timingSafeEqual` over a fixed-
   * length hex digest avoids a timing side-channel on the comparison;
   * both buffers are always 128 hex chars (SHA-512), so this never throws
   * on a length mismatch the way it would for an attacker-controlled length.
   */
  private verifyPaystackSignature(config: unknown, signature: string | undefined, rawBody: Buffer | undefined): void {
    const secretKey = (config as { paystack?: { secretKey?: string } } | null)?.paystack?.secretKey;
    if (!secretKey) throw new UnauthorizedException('PAYSTACK connector has no secretKey configured');
    if (!signature || !rawBody) throw new UnauthorizedException('Missing x-paystack-signature header');

    const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      throw new UnauthorizedException('Invalid Paystack webhook signature');
    }
  }
}
