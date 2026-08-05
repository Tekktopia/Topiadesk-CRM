import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CampaignChannel, getPrismaClient, Prisma, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { CampaignWebhookGuard } from './campaign-webhook.guard';
// Not type-only: CampaignWebhookEventDto is a @Body() parameter type
// (ValidationPipe needs the real class reference at runtime) and
// CampaignWebhookResponseDto is passed to @ApiOkResponse({ type: ... }) —
// see keycloak-webhook.controller.ts's identical comment.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above
import { CampaignWebhookEventDto, CampaignWebhookResponseDto } from './dto/campaign-webhook.dto';

/** DELIVERED/OPENED/CLICKED only move status forward through the funnel — an out-of-order/duplicate provider retry (e.g. OPENED arriving after CLICKED already landed) must not regress it. */
const FUNNEL_RANK: Partial<Record<string, number>> = { DELIVERED: 1, OPENED: 2, CLICKED: 3 };

/**
 * Generic provider-callback endpoints for email/SMS/WhatsApp delivery
 * events. There is no real Postmark/SendGrid/Twilio/WhatsApp Business
 * integration in this environment (see backend/worker's dispatch job header
 * comment for what's actually stubbed) — these routes are designed against
 * the lowest common denominator every such provider's webhook eventually
 * reduces to, so a real integration later is a payload-mapping change here,
 * not a redesign.
 *
 * Excluded from RlsContextMiddleware in app.module.ts (integration pass) —
 * a provider has no TopiaDesk-issued JWT, so it's secured independently by
 * CampaignWebhookGuard's shared-secret check instead, exactly like
 * identity/webhooks/keycloak. That means no RLS context is bound the normal
 * way, so the handler explicitly runs under SYSTEM_JOB_CONTEXT — required
 * here for RLS WRITE-SCOPE on campaign_recipients/campaign_suppressions
 * (both tables' WITH CHECK requires app_current_role() = 'SYSTEM_JOB' OR
 * app_max_scope('campaign','write') = 'ALL', and an unbound session has
 * neither). Note this is NOT about the audit trigger the way Keycloak's
 * comment describes: campaign_recipients and campaign_suppressions are
 * deliberately excluded from audit_chain_triggers (high-volume operational
 * data, see prisma/triggers/002_audit_chain_triggers.sql) — the RLS
 * write-scope requirement stands on its own regardless.
 */
@ApiTags('campaigns')
@ApiHeader({ name: 'x-campaign-webhook-secret', required: true, description: 'Shared secret — see CAMPAIGN_WEBHOOK_SECRET' })
@UseGuards(CampaignWebhookGuard)
@Controller('campaigns/webhooks')
export class CampaignWebhooksController {
  @Post('email/events')
  @ApiOkResponse({ type: CampaignWebhookResponseDto })
  handleEmailEvent(@Body() dto: CampaignWebhookEventDto): Promise<CampaignWebhookResponseDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.process(CampaignChannel.EMAIL, dto));
  }

  @Post('sms/events')
  @ApiOkResponse({ type: CampaignWebhookResponseDto })
  handleSmsEvent(@Body() dto: CampaignWebhookEventDto): Promise<CampaignWebhookResponseDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.process(CampaignChannel.SMS, dto));
  }

  @Post('whatsapp/events')
  @ApiOkResponse({ type: CampaignWebhookResponseDto })
  handleWhatsappEvent(@Body() dto: CampaignWebhookEventDto): Promise<CampaignWebhookResponseDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.process(CampaignChannel.WHATSAPP, dto));
  }

  private async process(channel: CampaignChannel, dto: CampaignWebhookEventDto): Promise<CampaignWebhookResponseDto> {
    const prisma = getPrismaClient();
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    const recipient = await prisma.campaignRecipient.findFirst({
      where: { externalMessageId: dto.externalMessageId, channel },
    });
    // A provider retry for an id we don't (or no longer) recognise is a
    // healthy no-op, not an error — returning 404 here would just invite
    // the provider's own retry-storm logic to keep hammering us.
    if (!recipient) return { matched: false, recipientId: null };

    if (dto.eventType === 'DELIVERED' || dto.eventType === 'OPENED' || dto.eventType === 'CLICKED') {
      const currentRank = FUNNEL_RANK[recipient.status] ?? 0;
      const newRank = FUNNEL_RANK[dto.eventType]!;
      if (newRank <= currentRank) return { matched: true, recipientId: recipient.id };

      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data:
          dto.eventType === 'DELIVERED'
            ? { status: 'DELIVERED', deliveredAt: occurredAt }
            : dto.eventType === 'OPENED'
              ? { status: 'OPENED', openedAt: occurredAt }
              : { status: 'CLICKED', clickedAt: occurredAt },
      });
      return { matched: true, recipientId: recipient.id };
    }

    if (dto.eventType === 'BOUNCED' || dto.eventType === 'COMPLAINED') {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'BOUNCED', bouncedAt: occurredAt, failureReason: dto.reason ?? dto.eventType },
      });
      await this.suppressContact(recipient.contactId, channel, dto.eventType === 'BOUNCED' ? 'bounce' : 'complaint');
      return { matched: true, recipientId: recipient.id };
    }

    // FAILED
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: 'FAILED', failureReason: dto.reason ?? 'FAILED' },
    });
    return { matched: true, recipientId: recipient.id };
  }

  /** Compliance backstop: a bounce/complaint suppresses the contact on this channel going forward, keyed on the normalized address (survives contact deletion — see CampaignSuppression's schema doc comment). */
  private async suppressContact(contactId: string, channel: CampaignChannel, reason: 'bounce' | 'complaint'): Promise<void> {
    const prisma = getPrismaClient();
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    const emailOrPhone = (channel === CampaignChannel.EMAIL ? contact?.email : contact?.phone)?.trim().toLowerCase();
    if (!emailOrPhone) return;
    await prisma.campaignSuppression
      .create({ data: { contactId, emailOrPhone, channel, reason: `Automatic: ${reason} via provider webhook` } })
      .catch((err: unknown) => {
        // P2002 on the (emailOrPhone, channel) unique constraint = already
        // suppressed — a healthy no-op, not an error.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      });
  }
}
