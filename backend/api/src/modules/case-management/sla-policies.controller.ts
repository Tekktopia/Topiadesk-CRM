import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type CaseManagementEntityType, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import {
  CreateSlaPolicyDto,
  CreateSlaTargetDto,
  SlaClockResponseDto,
  SlaComplianceReportRowDto,
  SlaPolicyResponseDto,
  SlaTargetResponseDto,
  UpdateSlaPolicyDto,
  UpdateSlaTargetDto,
} from './dto/sla-policy.dto';

/**
 * SlaPolicy/SlaTarget config — "admin-authored" per
 * prisma/rls/002_policies.sql's own comment on sla_policies_rw: read/write
 * both require app_max_scope('sla_config', ...) = 'ALL' (not the usual
 * OWN/DEPARTMENT/BRANCH ladder other resources use), so only ADMIN/
 * SYSTEM_JOB or an explicitly ALL-scoped role reaches these rows at all.
 * SlaClock rows are read-only here (breach-scan.job.ts and the
 * status-transition pause/resume/satisfy helpers are the only writers).
 */
@ApiTags('case-management')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('sla-policies')
export class SlaPoliciesController {
  @Get()
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: [SlaPolicyResponseDto] })
  async list(@Query('entityType') entityType?: CaseManagementEntityType): Promise<SlaPolicyResponseDto[]> {
    return getPrismaClient().slaPolicy.findMany({ where: { entityType }, include: { targets: true }, orderBy: { name: 'asc' } });
  }

  // Must precede ':id' — literal segments match ahead of a dynamic param at the same position.
  @Get('reports/compliance')
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: [SlaComplianceReportRowDto] })
  async complianceReport(@Query('slaPolicyId') slaPolicyId?: string): Promise<SlaComplianceReportRowDto[]> {
    const prisma = getPrismaClient();
    const targets = await prisma.slaTarget.findMany({ where: slaPolicyId ? { slaPolicyId } : undefined, include: { slaPolicy: true } });
    if (targets.length === 0) return [];

    const grouped = await prisma.slaClock.groupBy({
      by: ['slaTargetId', 'status'],
      where: { slaTargetId: { in: targets.map((t) => t.id) } },
      _count: { _all: true },
    });
    const countsByTarget = new Map<string, Record<string, number>>();
    for (const g of grouped) {
      if (!countsByTarget.has(g.slaTargetId)) countsByTarget.set(g.slaTargetId, {});
      countsByTarget.get(g.slaTargetId)![g.status] = g._count._all;
    }

    return targets.map((target) => {
      const c = countsByTarget.get(target.id) ?? {};
      const satisfiedCount = c.SATISFIED ?? 0;
      const breachedCount = c.BREACHED ?? 0;
      const runningCount = c.RUNNING ?? 0;
      const pausedCount = c.PAUSED ?? 0;
      const decided = satisfiedCount + breachedCount;
      return {
        slaTargetId: target.id,
        slaPolicyId: target.slaPolicyId,
        policyName: target.slaPolicy.name,
        metricType: target.metricType,
        totalClocks: satisfiedCount + breachedCount + runningCount + pausedCount,
        satisfiedCount,
        breachedCount,
        runningCount,
        pausedCount,
        percentAchieved: decided > 0 ? Math.round((satisfiedCount / decided) * 10000) / 100 : null,
      };
    });
  }

  @Get(':id')
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: SlaPolicyResponseDto })
  async getOne(@Param('id') id: string): Promise<SlaPolicyResponseDto> {
    const policy = await getPrismaClient().slaPolicy.findUnique({ where: { id }, include: { targets: true } });
    if (!policy) throw new NotFoundException('SlaPolicy not found');
    return policy;
  }

  @Get(':id/clocks')
  @RequirePermission('sla_config', 'read')
  @ApiOkResponse({ type: [SlaClockResponseDto] })
  async clocks(@Param('id') id: string): Promise<SlaClockResponseDto[]> {
    return getPrismaClient().slaClock.findMany({ where: { slaTarget: { slaPolicyId: id } }, orderBy: { dueAt: 'asc' } });
  }

  @Post()
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: SlaPolicyResponseDto })
  async create(@Body() dto: CreateSlaPolicyDto): Promise<SlaPolicyResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.slaPolicy.create({
      data: {
        name: dto.name,
        entityType: dto.entityType,
        caseType: dto.caseType,
        priority: dto.priority,
        businessHoursCalendarId: dto.businessHoursCalendarId,
        isActive: dto.isActive,
        rank: dto.rank,
      },
    });

    if (dto.targets && dto.targets.length > 0) {
      for (const target of dto.targets) {
        await prisma.slaTarget.create({ data: { slaPolicyId: policy.id, ...createTargetData(target) } });
      }
    }

    return prisma.slaPolicy.findUniqueOrThrow({ where: { id: policy.id }, include: { targets: true } });
  }

  @Patch(':id')
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: SlaPolicyResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateSlaPolicyDto): Promise<SlaPolicyResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.slaPolicy.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('SlaPolicy not found');
    return prisma.slaPolicy.update({
      where: { id },
      data: { name: dto.name, caseType: dto.caseType, priority: dto.priority, businessHoursCalendarId: dto.businessHoursCalendarId, isActive: dto.isActive, rank: dto.rank },
      include: { targets: true },
    });
  }

  @Delete(':id')
  @RequirePermission('sla_config', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.slaPolicy.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('SlaPolicy not found');
    await prisma.slaPolicy.delete({ where: { id } });
    return { deleted: true };
  }

  @Post(':id/targets')
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: SlaTargetResponseDto })
  async addTarget(@Param('id') id: string, @Body() dto: CreateSlaTargetDto): Promise<SlaTargetResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.slaPolicy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException('SlaPolicy not found');
    return prisma.slaTarget.create({ data: { slaPolicyId: id, ...createTargetData(dto) } });
  }

  @Patch(':id/targets/:targetId')
  @RequirePermission('sla_config', 'write')
  @ApiOkResponse({ type: SlaTargetResponseDto })
  async updateTarget(@Param('id') id: string, @Param('targetId') targetId: string, @Body() dto: UpdateSlaTargetDto): Promise<SlaTargetResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.slaTarget.findFirst({ where: { id: targetId, slaPolicyId: id } });
    if (!existing) throw new NotFoundException('SlaTarget not found');
    return prisma.slaTarget.update({
      where: { id: targetId },
      data: {
        metricType: dto.metricType,
        fromStatus: dto.fromStatus,
        toStatus: dto.toStatus,
        targetMinutes: dto.targetMinutes,
        escalateAfterMinutes: dto.escalateAfterMinutes,
        escalateToUserId: dto.escalateToUserId,
        escalateToTeamId: dto.escalateToTeamId,
        onBreachActions: dto.onBreachActions as Prisma.InputJsonValue | undefined,
        onEscalateActions: dto.onEscalateActions as Prisma.InputJsonValue | undefined,
      },
    });
  }

  @Delete(':id/targets/:targetId')
  @RequirePermission('sla_config', 'write')
  async removeTarget(@Param('id') id: string, @Param('targetId') targetId: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.slaTarget.findFirst({ where: { id: targetId, slaPolicyId: id } });
    if (!existing) throw new NotFoundException('SlaTarget not found');
    await prisma.slaTarget.delete({ where: { id: targetId } });
    return { deleted: true };
  }
}

function createTargetData(dto: CreateSlaTargetDto) {
  return {
    metricType: dto.metricType,
    fromStatus: dto.fromStatus,
    toStatus: dto.toStatus,
    targetMinutes: dto.targetMinutes,
    escalateAfterMinutes: dto.escalateAfterMinutes,
    escalateToUserId: dto.escalateToUserId,
    escalateToTeamId: dto.escalateToTeamId,
    onBreachActions: dto.onBreachActions as Prisma.InputJsonValue | undefined,
    onEscalateActions: dto.onEscalateActions as Prisma.InputJsonValue | undefined,
  };
}
