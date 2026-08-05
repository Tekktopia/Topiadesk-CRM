import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, getRlsContext } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { enqueueCampaignDispatch } from './campaign-dispatch-queue';
import {
  AbTestDecideWinnerResponseDto,
  CampaignPerformanceResponseDto,
  CampaignQueryDto,
  CampaignRecipientResponseDto,
  CampaignResponseDto,
  CreateCampaignDto,
  ScheduleCampaignDto,
  UpdateCampaignDto,
} from './dto/campaign.dto';

/** Statuses a campaign can no longer be edited/deleted from — already committed to a send in some form. */
const IN_FLIGHT_OR_DONE = new Set(['SENDING', 'SENT']);

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

/**
 * Send/schedule/pause/resume orchestration only — actual segment
 * resolution, CampaignRecipient materialization, merge-field resolution,
 * and provider sends all live in backend/worker/src/jobs/campaigns/
 * dispatch.job.ts (see that file's header comment for the full status
 * machine and why materialization happens where it does). This controller
 * just flips Campaign.status/scheduledSendAt and, for the two
 * latency-sensitive actions (send now, decide A/B winner), nudges the
 * worker with an immediate BullMQ job rather than waiting for its ~60s
 * repeatable poll.
 */
@ApiTags('campaigns')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('campaigns')
export class CampaignsController {
  @Get()
  @RequirePermission('campaign', 'read')
  @ApiOkResponse({ type: [CampaignResponseDto] })
  async list(@Query() query: CampaignQueryDto): Promise<CampaignResponseDto[]> {
    return getPrismaClient().campaign.findMany({
      where: { status: query.status, channel: query.channel },
      orderBy: { createdAt: 'desc' },
      include: { variants: true },
    });
  }

  @Get(':id')
  @RequirePermission('campaign', 'read')
  @ApiOkResponse({ type: CampaignResponseDto })
  async getOne(@Param('id') id: string): Promise<CampaignResponseDto> {
    const campaign = await getPrismaClient().campaign.findUnique({ where: { id }, include: { variants: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  /**
   * Campaign -> CampaignVariant(s) creation, sequential + manual
   * compensation — getPrismaClient()'s array-form $transaction is broken
   * through the RLS Proxy wrapper (see leads.controller.ts's convert()
   * header comment for the full empirical writeup); this mirrors that
   * exact workaround.
   */
  @Post()
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: CampaignResponseDto })
  async create(@Body() dto: CreateCampaignDto): Promise<CampaignResponseDto> {
    if (dto.abTestEnabled) {
      if (!dto.variants || dto.variants.length < 2) throw new BadRequestException('abTestEnabled requires at least 2 variants');
      const totalSplit = dto.variants.reduce((sum, v) => sum + v.splitPercent, 0);
      if (totalSplit !== 100) throw new BadRequestException(`Variant splitPercent must sum to 100 (got ${totalSplit})`);
      if (!dto.abTestMetric) throw new BadRequestException('abTestMetric is required when abTestEnabled');
      if (!dto.abTestSamplePercent) throw new BadRequestException('abTestSamplePercent is required when abTestEnabled');
    } else if (!dto.templateId) {
      throw new BadRequestException('templateId is required unless abTestEnabled with variants');
    }

    const prisma = getPrismaClient();
    const segment = await prisma.audienceSegment.findUnique({ where: { id: dto.segmentId } });
    if (!segment) throw new NotFoundException('segmentId not found');
    if (dto.templateId) {
      const template = await prisma.campaignTemplate.findUnique({ where: { id: dto.templateId } });
      if (!template) throw new NotFoundException('templateId not found');
    }

    const ctx = getRlsContext();
    if (!ctx) throw new Error('create() called outside an RLS context — RlsContextMiddleware should have bound one');

    const campaign = await prisma.campaign.create({
      data: {
        name: dto.name,
        channel: dto.channel,
        status: 'DRAFT',
        templateId: dto.templateId,
        segmentId: dto.segmentId,
        abTestEnabled: dto.abTestEnabled ?? false,
        abTestSamplePercent: dto.abTestSamplePercent,
        abTestMetric: dto.abTestMetric,
        createdById: ctx.userId,
      },
    });

    if (dto.variants && dto.variants.length > 0) {
      try {
        for (const v of dto.variants) {
          await prisma.campaignVariant.create({ data: { campaignId: campaign.id, label: v.label, templateId: v.templateId, splitPercent: v.splitPercent } });
        }
      } catch (err) {
        await prisma.campaign.delete({ where: { id: campaign.id } }).catch(() => undefined);
        throw err;
      }
    }

    return prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id }, include: { variants: true } });
  }

  @Patch(':id')
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: CampaignResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateCampaignDto): Promise<CampaignResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    if (IN_FLIGHT_OR_DONE.has(existing.status)) throw new ConflictException(`Cannot edit a campaign that is ${existing.status.toLowerCase()}`);

    return prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        channel: dto.channel,
        templateId: dto.templateId,
        segmentId: dto.segmentId,
        abTestEnabled: dto.abTestEnabled,
        abTestSamplePercent: dto.abTestSamplePercent,
        abTestMetric: dto.abTestMetric,
      },
      include: { variants: true },
    });
  }

  @Post(':id/schedule')
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: CampaignResponseDto })
  async schedule(@Param('id') id: string, @Body() dto: ScheduleCampaignDto): Promise<CampaignResponseDto> {
    await this.assertSchedulable(id);
    return getPrismaClient().campaign.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledSendAt: new Date(dto.scheduledSendAt) },
      include: { variants: true },
    });
  }

  /**
   * Sets scheduledSendAt = now and nudges the worker immediately rather
   * than waiting for its repeatable poll (~60s — see dispatch.job.ts) —
   * the actual send still happens worker-side, this just avoids the
   * latency of an idle poll tick for an explicit "send now" action.
   */
  @Post(':id/send')
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: CampaignResponseDto })
  async send(@Param('id') id: string): Promise<CampaignResponseDto> {
    await this.assertSchedulable(id);
    const updated = await getPrismaClient().campaign.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledSendAt: new Date() },
      include: { variants: true },
    });
    await enqueueCampaignDispatch(id);
    return updated;
  }

  @Post(':id/pause')
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: CampaignResponseDto })
  async pause(@Param('id') id: string): Promise<CampaignResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    if (existing.status !== 'SENDING' && existing.status !== 'SCHEDULED') {
      throw new ConflictException(`Cannot pause a campaign that is ${existing.status.toLowerCase()}`);
    }
    return prisma.campaign.update({ where: { id }, data: { status: 'PAUSED' }, include: { variants: true } });
  }

  @Post(':id/resume')
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: CampaignResponseDto })
  async resume(@Param('id') id: string): Promise<CampaignResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    if (existing.status !== 'PAUSED') throw new ConflictException(`Cannot resume a campaign that is ${existing.status.toLowerCase()}`);

    // Resuming a campaign that never started sending (paused while still
    // SCHEDULED) goes back to SCHEDULED so the poll's due-date check still
    // applies; one that had already started draining recipients (paused
    // while SENDING) goes straight back to SENDING to continue draining.
    const hasRecipients = (await prisma.campaignRecipient.count({ where: { campaignId: id } })) > 0;
    const nextStatus = hasRecipients ? 'SENDING' : 'SCHEDULED';
    const updated = await prisma.campaign.update({
      where: { id },
      data: nextStatus === 'SCHEDULED' ? { status: 'SCHEDULED', scheduledSendAt: new Date() } : { status: 'SENDING' },
      include: { variants: true },
    });
    await enqueueCampaignDispatch(id);
    return updated;
  }

  @Post(':id/cancel')
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: CampaignResponseDto })
  async cancel(@Param('id') id: string): Promise<CampaignResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    if (existing.status === 'SENT' || existing.status === 'CANCELLED') {
      throw new ConflictException(`Cannot cancel a campaign that is ${existing.status.toLowerCase()}`);
    }
    return prisma.campaign.update({ where: { id }, data: { status: 'CANCELLED' }, include: { variants: true } });
  }

  @Get(':id/recipients')
  @RequirePermission('campaign', 'read')
  @ApiOkResponse({ type: [CampaignRecipientResponseDto] })
  async recipients(@Param('id') id: string): Promise<CampaignRecipientResponseDto[]> {
    const prisma = getPrismaClient();
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return prisma.campaignRecipient.findMany({ where: { campaignId: id }, orderBy: { createdAt: 'desc' } });
  }

  @Get(':id/performance')
  @RequirePermission('campaign', 'read')
  @ApiOkResponse({ type: CampaignPerformanceResponseDto })
  async performance(@Param('id') id: string): Promise<CampaignPerformanceResponseDto> {
    const prisma = getPrismaClient();
    const campaign = await prisma.campaign.findUnique({ where: { id }, include: { variants: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const grouped = await prisma.campaignRecipient.groupBy({ by: ['status'], where: { campaignId: id }, _count: true });
    const counts: Record<string, number> = {};
    for (const g of grouped) counts[g.status] = g._count;

    // "sent" = left our side successfully at least once, including
    // subsequent terminal outcomes (a BOUNCED message was still sent).
    const sent = (counts.SENT ?? 0) + (counts.DELIVERED ?? 0) + (counts.OPENED ?? 0) + (counts.CLICKED ?? 0) + (counts.BOUNCED ?? 0);
    const delivered = (counts.DELIVERED ?? 0) + (counts.OPENED ?? 0) + (counts.CLICKED ?? 0);
    const opened = (counts.OPENED ?? 0) + (counts.CLICKED ?? 0); // CLICKED implies OPENED
    const clicked = counts.CLICKED ?? 0;
    const totalRecipients = Object.values(counts).reduce((a, b) => a + b, 0);

    const result: CampaignPerformanceResponseDto = {
      totalRecipients,
      sent,
      delivered,
      opened,
      clicked,
      bounced: counts.BOUNCED ?? 0,
      failed: counts.FAILED ?? 0,
      unsubscribed: counts.UNSUBSCRIBED ?? 0,
      deliveryRate: rate(delivered, sent),
      openRate: rate(opened, delivered),
      clickRate: rate(clicked, delivered),
      bounceRate: rate(counts.BOUNCED ?? 0, sent),
    };

    if (campaign.variants.length > 0) {
      const byVariantGrouped = await prisma.campaignRecipient.groupBy({
        by: ['variantId', 'status'],
        where: { campaignId: id, variantId: { not: null } },
        _count: true,
      });
      result.byVariant = campaign.variants.map((v) => {
        const rows = byVariantGrouped.filter((g) => g.variantId === v.id);
        const c = (status: string) => rows.find((r) => r.status === status)?._count ?? 0;
        const vSent = c('SENT') + c('DELIVERED') + c('OPENED') + c('CLICKED') + c('BOUNCED');
        const vOpened = c('OPENED') + c('CLICKED');
        const vClicked = c('CLICKED');
        return { variantId: v.id, label: v.label, sent: vSent, opened: vOpened, clicked: vClicked, openRate: rate(vOpened, vSent), clickRate: rate(vClicked, vSent) };
      });
    }

    return result;
  }

  /**
   * Compares variant performance by campaign.abTestMetric, decides a
   * winner, and — if abTestSamplePercent < 100 — assigns the winner's
   * variantId to the recipients held back from the initial test sample
   * (materialized with variantId=null by the worker's AB-split logic, see
   * dispatch.job.ts) and nudges the worker to drain them.
   */
  @Post(':id/ab-test/decide-winner')
  @RequirePermission('campaign', 'write')
  @ApiOkResponse({ type: AbTestDecideWinnerResponseDto })
  async decideAbTestWinner(@Param('id') id: string): Promise<AbTestDecideWinnerResponseDto> {
    const prisma = getPrismaClient();
    const campaign = await prisma.campaign.findUnique({ where: { id }, include: { variants: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!campaign.abTestEnabled) throw new BadRequestException('A/B testing is not enabled for this campaign');
    if (campaign.abTestDecidedAt) throw new ConflictException('A/B test winner has already been decided for this campaign');
    if (!campaign.abTestMetric) throw new BadRequestException('abTestMetric is not set');
    if (campaign.variants.length === 0) throw new BadRequestException('Campaign has no variants to compare');

    const grouped = await prisma.campaignRecipient.groupBy({
      by: ['variantId', 'status'],
      where: { campaignId: id, variantId: { not: null } },
      _count: true,
    });

    let winner: (typeof campaign.variants)[number] | undefined;
    let winnerRate = -1;
    let anySentData = false;
    for (const v of campaign.variants) {
      const rows = grouped.filter((g) => g.variantId === v.id);
      const c = (status: string) => rows.find((r) => r.status === status)?._count ?? 0;
      const vSent = c('SENT') + c('DELIVERED') + c('OPENED') + c('CLICKED') + c('BOUNCED');
      if (vSent > 0) anySentData = true;
      const vOpened = c('OPENED') + c('CLICKED');
      const vClicked = c('CLICKED');
      const vRate = campaign.abTestMetric === 'OPEN_RATE' ? rate(vOpened, vSent) : rate(vClicked, vSent);
      if (vRate > winnerRate) {
        winnerRate = vRate;
        winner = v;
      }
    }
    if (!anySentData || !winner) throw new BadRequestException('Not enough send data yet to decide an A/B test winner');

    const abTestDecidedAt = new Date();
    await prisma.campaign.update({ where: { id }, data: { abTestWinnerVariantId: winner.id, abTestDecidedAt } });

    let remainingRecipientsEnqueued = 0;
    if ((campaign.abTestSamplePercent ?? 100) < 100) {
      const heldBack = await prisma.campaignRecipient.findMany({ where: { campaignId: id, variantId: null, status: 'PENDING' } });
      for (const r of heldBack) {
        await prisma.campaignRecipient.update({ where: { id: r.id }, data: { variantId: winner.id } });
      }
      remainingRecipientsEnqueued = heldBack.length;
    }
    // Always nudge the worker, even with zero held-back recipients (e.g.
    // abTestSamplePercent = 100) — dispatch.job.ts's drain pass is also
    // what flips Campaign.status SENDING -> SENT once nothing PENDING
    // remains, which otherwise would never happen for an A/B campaign
    // after its winner is decided.
    await enqueueCampaignDispatch(id);

    return { abTestWinnerVariantId: winner.id, abTestDecidedAt, remainingRecipientsEnqueued };
  }

  private async assertSchedulable(id: string) {
    const prisma = getPrismaClient();
    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    if (existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
      throw new ConflictException(`Cannot schedule/send a campaign that is ${existing.status.toLowerCase()}`);
    }
    if (!existing.segmentId) throw new BadRequestException('Campaign has no audience segment');
    if (!existing.templateId) {
      const variantCount = await prisma.campaignVariant.count({ where: { campaignId: id } });
      if (variantCount === 0) throw new BadRequestException('Campaign has no template and no A/B variants');
    }
    return existing;
  }
}
