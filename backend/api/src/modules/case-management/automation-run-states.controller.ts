import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type AutomationRunState } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AutomationRunStateQueryDto, AutomationRunStateResponseDto, DecideAutomationRunDto } from './dto/automation-run-state.dto';
import { enqueueAutomationRunResume } from './automation-run-resume.util';

function toResponse(run: AutomationRunState & { rule: { name: string } | null }): AutomationRunStateResponseDto {
  return {
    id: run.id,
    ruleId: run.ruleId,
    ruleName: run.rule?.name,
    entityType: run.entityType,
    entityId: run.entityId,
    status: run.status,
    currentStepIndex: run.currentStepIndex,
    approvalId: run.approvalId,
    failureReason: run.failureReason,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}

/**
 * Visibility + human-decision surface for AutomationRunState (the
 * multi-step workflow engine's in-progress/finished runs) — see
 * backend/worker/src/automation/run-engine.ts for where these rows are
 * created/advanced. RLS (automation_run_states_rw,
 * prisma/rls/002_policies.sql) already scopes `list`/`getOne` to whatever
 * Case/Claim the caller can see, or approval:read ALL oversight — no
 * manual WHERE filtering needed here beyond the query params themselves.
 */
@ApiTags('case-management')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('automation-run-states')
export class AutomationRunStatesController {
  @Get()
  @RequirePermission('case', 'read')
  @ApiOkResponse({ type: [AutomationRunStateResponseDto] })
  async list(@Query() query: AutomationRunStateQueryDto): Promise<AutomationRunStateResponseDto[]> {
    const runs = await getPrismaClient().automationRunState.findMany({
      where: { entityType: query.entityType, entityId: query.entityId },
      include: { rule: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
    });
    return runs.map(toResponse);
  }

  @Get(':id')
  @RequirePermission('case', 'read')
  @ApiOkResponse({ type: AutomationRunStateResponseDto })
  async getOne(@Param('id') id: string): Promise<AutomationRunStateResponseDto> {
    const run = await getPrismaClient().automationRunState.findUnique({ where: { id }, include: { rule: { select: { name: true } } } });
    if (!run) throw new NotFoundException('AutomationRunState not found');
    return toResponse(run);
  }

  /**
   * Decides the Approval blocking a WAITING_APPROVAL run and, if approved,
   * resumes execution from the next step. Mirrors
   * KnowledgeArticlesService.decideApproval()'s segregation-of-duties
   * shape — the rule's own author (Approval.requestedById, set by
   * run-engine.ts to AutomationRule.createdById) can never decide their
   * own rule's gate.
   */
  @Post(':id/decision')
  @RequirePermission('approval', 'write')
  @ApiOkResponse({ type: AutomationRunStateResponseDto })
  async decide(@Param('id') id: string, @Body() dto: DecideAutomationRunDto, @CurrentUser() user: AuthenticatedUser): Promise<AutomationRunStateResponseDto> {
    const prisma = getPrismaClient();
    const run = await prisma.automationRunState.findUnique({ where: { id }, include: { rule: { select: { name: true } } } });
    if (!run) throw new NotFoundException('AutomationRunState not found');
    if (run.status !== 'WAITING_APPROVAL' || !run.approvalId) {
      throw new NotFoundException('This run is not awaiting a decision');
    }

    const approval = await prisma.approval.findUnique({ where: { id: run.approvalId } });
    if (!approval || approval.status !== 'PENDING') {
      throw new NotFoundException('No pending approval for this run');
    }
    if (approval.requestedById === user.id) {
      throw new ForbiddenException("Cannot decide your own rule's approval gate");
    }

    if (dto.decision === 'APPROVED') {
      await prisma.approval.update({ where: { id: approval.id }, data: { status: 'APPROVED', approvedById: user.id, decidedAt: new Date() } });
      const updated = await prisma.automationRunState.update({
        where: { id },
        data: { status: 'RUNNING', currentStepIndex: run.currentStepIndex + 1 },
        include: { rule: { select: { name: true } } },
      });
      await enqueueAutomationRunResume(id).catch(() => undefined);
      return toResponse(updated);
    }

    await prisma.approval.update({ where: { id: approval.id }, data: { status: 'REJECTED', approvedById: user.id, decidedAt: new Date() } });
    const updated = await prisma.automationRunState.update({
      where: { id },
      data: { status: 'FAILED', failureReason: 'Approval rejected' },
      include: { rule: { select: { name: true } } },
    });
    return toResponse(updated);
  }
}
