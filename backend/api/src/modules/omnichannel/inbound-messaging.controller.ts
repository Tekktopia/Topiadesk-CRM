import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type ActivityType } from '@topiadesk/db';
import { ensureCaseSlaClocks } from '../case-management/sla-clock.util';
import { enqueueEntityEvent } from '../case-management/automation-events.util';
import { OmnichannelWebhookGuard } from './omnichannel-webhook.guard';
import { InboundMessagingWebhookDto, InboundWebhookResponseDto } from './dto/inbound-webhook.dto';
import { findOpenCaseByChannelDetail, generateCaseNumber } from './omnichannel.util';

/**
 * WhatsApp/SMS-to-case. Twilio-compatible-ish payload shape
 * (`From`/`Body`/`MessageSid`) — no live Twilio/Meta account is wired up in
 * this environment, so this is a real, idempotent, working receiving
 * endpoint, honestly not live-tested against an actual provider's servers.
 * Full Twilio request-signature (HMAC-SHA1 X-Twilio-Signature) verification
 * is the production-correct hardening once a real account exists — see
 * omnichannel-webhook.guard.ts's header comment for why a shared-secret
 * header is the v1 stub instead. Threading is by sender phone number
 * (`channelDetail`), not a reply-to id — SMS/WhatsApp don't give one the
 * way email does.
 */
async function handleInbound(sourceChannel: 'WHATSAPP' | 'SMS', activityType: ActivityType, dto: InboundMessagingWebhookDto): Promise<InboundWebhookResponseDto> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();

    const existing = await prisma.activity.findUnique({ where: { externalMessageId: dto.MessageSid } });
    if (existing) return { status: 'duplicate', caseId: existing.caseId };

    const openCase = await findOpenCaseByChannelDetail(dto.From, sourceChannel);

    if (openCase) {
      await prisma.activity.create({
        data: {
          caseId: openCase.id,
          type: activityType,
          direction: 'INBOUND',
          subject: `${sourceChannel} message`,
          body: dto.Body,
          occurredAt: new Date(),
          createdBySystemJob: `omnichannel-inbound-${sourceChannel.toLowerCase()}`,
          channelDetail: dto.From,
          externalMessageId: dto.MessageSid,
        },
      });
      return { status: 'appended', caseId: openCase.id };
    }

    const kase = await prisma.case.create({
      data: {
        caseNumber: generateCaseNumber(),
        caseType: 'ENQUIRY',
        subject: `${sourceChannel} from ${dto.From}`,
        sourceChannel: activityType,
      },
    });
    await prisma.activity.create({
      data: {
        caseId: kase.id,
        type: activityType,
        direction: 'INBOUND',
        subject: `${sourceChannel} message`,
        body: dto.Body,
        occurredAt: new Date(),
        createdBySystemJob: `omnichannel-inbound-${sourceChannel.toLowerCase()}`,
        channelDetail: dto.From,
        externalMessageId: dto.MessageSid,
      },
    });

    await ensureCaseSlaClocks(kase.id, null, kase.caseType, kase.priority, kase.accountId).catch((err: unknown) => {
      console.error(`[omnichannel] failed to start SLA clocks for case ${kase.id}`, err);
    });
    await enqueueEntityEvent({ entityType: 'CASE', entityId: kase.id, eventType: 'CREATED', occurredAt: kase.createdAt.toISOString() }).catch(() => undefined);

    return { status: 'created', caseId: kase.id };
  });
}

@ApiTags('omnichannel')
@UseGuards(OmnichannelWebhookGuard)
@Controller('public/webhooks')
export class InboundMessagingController {
  @Post('whatsapp')
  @ApiOkResponse({ type: InboundWebhookResponseDto })
  async receiveWhatsapp(@Body() dto: InboundMessagingWebhookDto): Promise<InboundWebhookResponseDto> {
    return handleInbound('WHATSAPP', 'WHATSAPP', dto);
  }

  @Post('sms')
  @ApiOkResponse({ type: InboundWebhookResponseDto })
  async receiveSms(@Body() dto: InboundMessagingWebhookDto): Promise<InboundWebhookResponseDto> {
    return handleInbound('SMS', 'SMS', dto);
  }
}
