import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { ensureCaseSlaClocks } from '../case-management/sla-clock.util';
import { enqueueEntityEvent } from '../case-management/automation-events.util';
import { OmnichannelWebhookGuard } from './omnichannel-webhook.guard';
import { InboundEmailWebhookDto, InboundWebhookResponseDto } from './dto/inbound-webhook.dto';
import { findParentActivityForThreading, generateCaseNumber } from './omnichannel.util';

/**
 * Email-to-case: a provider (SendGrid/Postmark/Mailgun-shaped inbound
 * parse webhook, or a manual curl simulating one — no live provider
 * account is wired up in this environment) posts here on every inbound
 * email. See omnichannel-webhook.guard.ts for the auth model and
 * app.module.ts's RlsContextMiddleware exclusion list for why this route
 * needs one and runs under SYSTEM_JOB_CONTEXT.
 */
@ApiTags('omnichannel')
@UseGuards(OmnichannelWebhookGuard)
@Controller('public/webhooks/inbound-email')
export class InboundEmailController {
  @Post()
  @ApiOkResponse({ type: InboundWebhookResponseDto })
  async receive(@Body() dto: InboundEmailWebhookDto): Promise<InboundWebhookResponseDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
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
