import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { ensureCaseSlaClocks } from '../case-management/sla-clock.util';
import { enqueueEntityEvent } from '../case-management/automation-events.util';
import { OmnichannelWebhookGuard } from './omnichannel-webhook.guard';
import { InboundEmailWebhookDto, InboundWebhookResponseDto } from './dto/inbound-webhook.dto';
import { findParentActivityForThreading, generateCaseNumber } from './omnichannel.util';

/**
 * Pulls the bare address out of a header-style sender/recipient string
 * ("Support Team <support@acme.com>") — providers vary on whether `to`
 * arrives bare or wrapped, and platform.tenants.inboundEmailAddress is
 * stored bare + lowercased (inbound-email-settings.controller.ts), so the
 * lookup key has to be normalized the same way regardless of which shape
 * showed up on the wire.
 */
function normalizeEmailAddress(raw: string): string {
  const match = /<([^>]+)>/.exec(raw);
  return (match?.[1] ?? raw).trim().toLowerCase();
}

/**
 * Email-to-case: a provider (SendGrid/Postmark/Mailgun-shaped inbound
 * parse webhook, or a manual curl simulating one — no live provider
 * account is wired up in this environment) posts here on every inbound
 * email. See omnichannel-webhook.guard.ts for the auth model and
 * app.module.ts's RlsContextMiddleware exclusion list for why this route
 * needs one.
 *
 * Multi-tenant routing: this endpoint is PUBLIC and unauthenticated (mail
 * providers can't present a tenant's own bearer token), so which tenant's
 * Postgres schema an arriving message belongs to has to be resolved from
 * the message itself — `dto.to` against platform.tenants.inboundEmailAddress
 * (set via Admin -> Integrations -> Inbound Email). Everything below this
 * lookup runs under THAT tenant's schema, never a bare SYSTEM_JOB_CONTEXT
 * (which resolves to the original pre-multi-tenant 'public' schema) — a
 * previous version of this handler did exactly that, which would have
 * collided every tenant's inbound mail into one shared schema the moment a
 * second tenant configured this feature.
 */
@ApiTags('omnichannel')
@UseGuards(OmnichannelWebhookGuard)
@Controller('public/webhooks/inbound-email')
export class InboundEmailController {
  @Post()
  @ApiOkResponse({ type: InboundWebhookResponseDto })
  async receive(@Body() dto: InboundEmailWebhookDto): Promise<InboundWebhookResponseDto> {
    const toAddress = normalizeEmailAddress(dto.to);
    const tenant = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPlatformPrismaClient().tenant.findUnique({
        where: { inboundEmailAddress: toAddress },
        select: { schemaName: true, keycloakRealm: true, status: true },
      }),
    );
    // No tenant has claimed this address (never configured, mistyped
    // provider setup, or a stale/removed one) — never a real Case, an
    // unauthenticated sender can't be allowed to create work in an
    // arbitrary tenant's queue just by guessing at an address. Reported as
    // "ignored" rather than a 404/500 so the provider doesn't endlessly
    // retry a message that was never going to match.
    if (!tenant || tenant.status !== 'ACTIVE') {
      return { status: 'ignored', caseId: null };
    }

    return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: tenant.schemaName, keycloakRealm: tenant.keycloakRealm }, async () => {
      const prisma = getPrismaClient();

      // Idempotency: webhook retries are normal — a provider redelivering
      // the same message must never create a second Activity/Case.
      const existing = await prisma.activity.findUnique({ where: { externalMessageId: dto.messageId } });
      if (existing) return { status: 'duplicate', caseId: existing.caseId };

      const parent = dto.inReplyTo ? await findParentActivityForThreading(dto.inReplyTo) : null;

      if (parent?.caseId) {
        await prisma.activity.create({
          data: {
            caseId: parent.caseId,
            type: 'EMAIL',
            direction: 'INBOUND',
            subject: dto.subject,
            body: dto.text,
            occurredAt: new Date(),
            createdBySystemJob: 'omnichannel-inbound-email',
            channelDetail: dto.from,
            externalMessageId: dto.messageId,
            externalThreadId: parent.threadId,
          },
        });
        return { status: 'appended', caseId: parent.caseId };
      }

      // No Contact is created for an unmatched sender — Contact requires
      // exactly one of accountId/carrierId (contacts_exactly_one_parent),
      // which an unmatched inbound sender has neither of. Sender address
      // lives on the Activity's channelDetail instead — see
      // live-chat.controller.ts's startSession() for the same reasoning.
      const kase = await prisma.case.create({
        data: {
          caseNumber: generateCaseNumber(),
          caseType: 'ENQUIRY',
          subject: dto.subject,
          sourceChannel: 'EMAIL',
        },
      });
      await prisma.activity.create({
        data: {
          caseId: kase.id,
          type: 'EMAIL',
          direction: 'INBOUND',
          subject: dto.subject,
          body: dto.text,
          occurredAt: new Date(),
          createdBySystemJob: 'omnichannel-inbound-email',
          channelDetail: dto.from,
          externalMessageId: dto.messageId,
          // Root of a new thread: its own messageId IS the thread key —
          // see findParentActivityForThreading()'s doc comment.
          externalThreadId: dto.messageId,
        },
      });

      await ensureCaseSlaClocks(kase.id, null, kase.caseType, kase.priority, kase.accountId).catch((err: unknown) => {
        console.error(`[omnichannel] failed to start SLA clocks for case ${kase.id}`, err);
      });
      await enqueueEntityEvent({ entityType: 'CASE', entityId: kase.id, eventType: 'CREATED', occurredAt: kase.createdAt.toISOString() }).catch(() => undefined);

      return { status: 'created', caseId: kase.id };
    });
  }
}
