import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  BulkAssignOpportunitiesDto,
  BulkDeleteOpportunitiesDto,
  BulkUpdateOpportunitiesDto,
  CreateOpportunityDto,
  OpportunityQueryDto,
  OpportunityResponseDto,
  StageHistoryEntryDto,
  UpdateOpportunityDto,
  UpdateOpportunityStageDto,
} from './dto/opportunity.dto';
import { CreateMarketSubmissionDto, MarketSubmissionResponseDto, UpdateMarketSubmissionDto } from './dto/opportunity-market-submission.dto';
import { toMarketSubmissionDto, toOpportunityDto } from './mapping';
import { BulkActionResponseDto } from './dto/bulk-action.dto';
import { validateCustomFields } from './custom-fields.validator';
import { diffBulkIds } from './bulk-actions';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/opportunities')
export class OpportunitiesController {
  // Pipeline/revenue-ready listing — same "open" predicate
  // (pipelineStage.isWon=false AND isLost=false) as dashboards.controller.ts's
  // operational-kpis query, so filtered views here stay consistent with that
  // dashboard's numbers.
  @Get()
  @RequirePermission('opportunity', 'read')
  @ApiOkResponse({ type: [OpportunityResponseDto] })
  async list(@Query() query: OpportunityQueryDto): Promise<OpportunityResponseDto[]> {
    const opportunities = await getPrismaClient().opportunity.findMany({
      where: {
        accountId: query.accountId,
        ownerId: query.ownerId,
        lineOfBusiness: query.lineOfBusiness,
        pipelineStageId: query.pipelineStageId,
        pipelineStage:
          query.pipelineId !== undefined || query.isOpen !== undefined
            ? {
                pipelineId: query.pipelineId,
                ...(query.isOpen ? { isWon: false, isLost: false } : {}),
              }
            : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
    return opportunities.map(toOpportunityDto);
  }

  @Get(':id')
  @RequirePermission('opportunity', 'read')
  @ApiOkResponse({ type: OpportunityResponseDto })
  async getOne(@Param('id') id: string): Promise<OpportunityResponseDto> {
    const opportunity = await getPrismaClient().opportunity.findUnique({ where: { id } });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    return toOpportunityDto(opportunity);
  }

  /**
   * Every stage move, oldest first — reconstructed from the tamper-evident
   * audit log rather than a dedicated table (there isn't one; see
   * packages/reports/src/definitions/sales-pipeline-conversion-velocity.ts's
   * own comment on this). `audit_log` itself is RLS-locked to
   * audit_log:read (ADMIN/COMPLIANCE_OFFICER only) — a regular rep viewing
   * their own deal has neither, so the read below runs under
   * SYSTEM_JOB_CONTEXT to bypass that row-level restriction, but only AFTER
   * confirming (under the caller's own real RLS context, one line up) that
   * this specific opportunity is visible to them at all. That ordering is
   * load-bearing: it's what keeps this from becoming a way to read another
   * team's opportunity history just by guessing its id.
   */
  @Get(':id/stage-history')
  @RequirePermission('opportunity', 'read')
  @ApiOkResponse({ type: [StageHistoryEntryDto] })
  async stageHistory(@Param('id') id: string): Promise<StageHistoryEntryDto[]> {
    const prisma = getPrismaClient();
    const opportunity = await prisma.opportunity.findUnique({ where: { id } });
    if (!opportunity) throw new NotFoundException('Opportunity not found');

    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const rows = await prisma.auditLog.findMany({
        where: { entityType: 'opportunities', entityId: id, action: 'UPDATE' },
        include: { actorUser: { select: { fullName: true } } },
        orderBy: { id: 'asc' },
      });

      const transitions = rows
        .map((row) => {
          const changed = row.changedFields as Record<string, { old: unknown; new: unknown }> | null;
          const diff = changed?.pipeline_stage_id;
          if (!diff) return null;
          return {
            changedAt: row.createdAt,
            actorName: row.actorUser?.fullName ?? null,
            fromStageId: (diff.old as string | null) ?? null,
            toStageId: (diff.new as string | null) ?? null,
          };
        })
        .filter((t): t is NonNullable<typeof t> => t !== null);

      const stageIds = [...new Set(transitions.flatMap((t) => [t.fromStageId, t.toStageId]).filter((v): v is string => Boolean(v)))];
      const stages = stageIds.length ? await prisma.pipelineStage.findMany({ where: { id: { in: stageIds } } }) : [];
      const nameById = new Map(stages.map((s) => [s.id, s.name]));

      return transitions.map((t) => ({
        changedAt: t.changedAt,
        actorName: t.actorName,
        fromStageId: t.fromStageId,
        fromStageName: t.fromStageId ? (nameById.get(t.fromStageId) ?? 'Unknown stage') : null,
        toStageId: t.toStageId,
        toStageName: t.toStageId ? (nameById.get(t.toStageId) ?? 'Unknown stage') : null,
      }));
    });
  }

  @Post()
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: OpportunityResponseDto })
  async create(@Body() dto: CreateOpportunityDto, @CurrentUser() user: AuthenticatedUser): Promise<OpportunityResponseDto> {
    const prisma = getPrismaClient();
    await validateCustomFields('OPPORTUNITY', dto.customFields, { isCreate: true });
    let probability = dto.probability;
    if (probability === undefined) {
      const stage = await prisma.pipelineStage.findUnique({ where: { id: dto.pipelineStageId } });
      if (!stage) throw new NotFoundException('pipelineStageId not found');
      probability = stage.defaultProbability;
    }
    const opportunity = await prisma.opportunity.create({
      data: {
        accountId: dto.accountId,
        name: dto.name,
        pipelineStageId: dto.pipelineStageId,
        amount: dto.amount,
        currency: dto.currency,
        probability,
        expectedCloseDate: new Date(dto.expectedCloseDate),
        actualCloseDate: dto.actualCloseDate ? new Date(dto.actualCloseDate) : undefined,
        wonReason: dto.wonReason,
        lostReason: dto.lostReason,
        ownerId: dto.ownerId ?? user.id,
        lineOfBusiness: dto.lineOfBusiness,
        customFields: dto.customFields as Prisma.InputJsonValue | undefined,
      },
    });
    return toOpportunityDto(opportunity);
  }

  @Patch(':id')
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: OpportunityResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateOpportunityDto): Promise<OpportunityResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.opportunity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Opportunity not found');
    await validateCustomFields('OPPORTUNITY', dto.customFields, { isCreate: false });
    const updated = await prisma.opportunity.update({
      where: { id },
      data: {
        ...dto,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        actualCloseDate: dto.actualCloseDate ? new Date(dto.actualCloseDate) : undefined,
        customFields: dto.customFields as Prisma.InputJsonValue | undefined,
      },
    });
    return toOpportunityDto(updated);
  }

  @Delete(':id')
  @RequirePermission('opportunity', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.opportunity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Opportunity not found');
    await prisma.opportunity.delete({ where: { id } });
    return { deleted: true };
  }

  @Post('bulk/assign')
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkAssign(@Body() dto: BulkAssignOpportunitiesDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.opportunity.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((o) => o.id));
    if (matched.length > 0) {
      await prisma.opportunity.updateMany({ where: { id: { in: matched } }, data: { ownerId: dto.ownerId } });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  @Post('bulk/update')
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkUpdate(@Body() dto: BulkUpdateOpportunitiesDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.opportunity.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((o) => o.id));
    if (matched.length > 0) {
      await prisma.opportunity.updateMany({
        where: { id: { in: matched } },
        data: { lineOfBusiness: dto.lineOfBusiness, ownerId: dto.ownerId, wonReason: dto.wonReason, lostReason: dto.lostReason },
      });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  @Post('bulk/delete')
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkDelete(@Body() dto: BulkDeleteOpportunitiesDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.opportunity.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((o) => o.id));
    if (matched.length > 0) {
      await prisma.opportunity.deleteMany({ where: { id: { in: matched } } });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  // Stage transition. No manual AuditService call — 'opportunities' is on
  // the generic trigger's tracked-table list (prisma/triggers/
  // 002_audit_chain_triggers.sql), so this UPDATE is captured automatically,
  // hash-chained, with a changed_fields diff including the stage move.
  @Patch(':id/stage')
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: OpportunityResponseDto })
  async updateStage(@Param('id') id: string, @Body() dto: UpdateOpportunityStageDto): Promise<OpportunityResponseDto> {
    const prisma = getPrismaClient();
    const [opportunity, targetStage] = await Promise.all([
      prisma.opportunity.findUnique({ where: { id }, include: { pipelineStage: true } }),
      prisma.pipelineStage.findUnique({ where: { id: dto.pipelineStageId } }),
    ]);
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    if (!targetStage) throw new NotFoundException('pipelineStageId not found');
    if (targetStage.pipelineId !== opportunity.pipelineStage.pipelineId) {
      throw new BadRequestException('Target stage must belong to the same pipeline as the opportunity\'s current stage');
    }

    const updated = await prisma.opportunity.update({
      where: { id },
      data: {
        pipelineStageId: dto.pipelineStageId,
        probability: dto.probability ?? targetStage.defaultProbability,
        actualCloseDate: dto.actualCloseDate ? new Date(dto.actualCloseDate) : undefined,
        wonReason: dto.wonReason,
        lostReason: dto.lostReason,
      },
    });
    return toOpportunityDto(updated);
  }

  @Get(':id/market-submissions')
  @RequirePermission('opportunity', 'read')
  @ApiOkResponse({ type: [MarketSubmissionResponseDto] })
  async listMarketSubmissions(@Param('id') id: string): Promise<MarketSubmissionResponseDto[]> {
    const submissions = await getPrismaClient().opportunityMarketSubmission.findMany({
      where: { opportunityId: id },
      orderBy: { submittedAt: 'desc' },
    });
    return submissions.map(toMarketSubmissionDto);
  }

  @Post(':id/market-submissions')
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: MarketSubmissionResponseDto })
  async createMarketSubmission(@Param('id') id: string, @Body() dto: CreateMarketSubmissionDto): Promise<MarketSubmissionResponseDto> {
    const prisma = getPrismaClient();
    const opportunity = await prisma.opportunity.findUnique({ where: { id } });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    const submission = await prisma.opportunityMarketSubmission.create({
      data: { opportunityId: id, carrierId: dto.carrierId, quotedPremium: dto.quotedPremium, status: dto.status, notes: dto.notes },
    });
    return toMarketSubmissionDto(submission);
  }
}

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/market-submissions')
export class MarketSubmissionsController {
  @Patch(':id')
  @RequirePermission('opportunity', 'write')
  @ApiOkResponse({ type: MarketSubmissionResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateMarketSubmissionDto): Promise<MarketSubmissionResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.opportunityMarketSubmission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('OpportunityMarketSubmission not found');
    const updated = await prisma.opportunityMarketSubmission.update({
      where: { id },
      data: {
        carrierId: dto.carrierId,
        quotedPremium: dto.quotedPremium,
        status: dto.status,
        notes: dto.notes,
        respondedAt: dto.status && dto.status !== 'SUBMITTED' ? new Date() : undefined,
      },
    });
    return toMarketSubmissionDto(updated);
  }

  @Delete(':id')
  @RequirePermission('opportunity', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.opportunityMarketSubmission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('OpportunityMarketSubmission not found');
    await prisma.opportunityMarketSubmission.delete({ where: { id } });
    return { deleted: true };
  }
}
