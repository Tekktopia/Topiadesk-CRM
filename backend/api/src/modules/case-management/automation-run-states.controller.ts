import { Controller, Get, NotFoundException, Param, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type AutomationRunState } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AutomationRunStateQueryDto, AutomationRunStateResponseDto, DecideAutomationRunDto } from './dto/automation-run-state.dto';
import { decideAutomationRun } from './automation-run-decision';

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
   * Decides whatever is blocking a WAITING_APPROVAL run — see
   * automation-run-decision.ts's decideAutomationRun() for the full
   * behavior/reasoning (extracted there so it has a second real caller:
   * teams-actions.controller.ts's inbound Approve/Reject button callback,
   * see that file for the two-way Microsoft Teams integration this
   * enables). This method is now a thin wrapper — same route, same
   * behavior as before the extraction.
   *
   * Deliberately NO @RequirePermission('approval','write') here — see
   * decideAutomationRun()'s own reasoning: authorization lives entirely in
   * the allowlist check plus RLS.
   */
  @Post(':id/decision')
  @ApiOkResponse({ type: AutomationRunStateResponseDto })
  async decide(@Param('id') id: string, @Body() dto: DecideAutomationRunDto, @CurrentUser() user: AuthenticatedUser): Promise<AutomationRunStateResponseDto> {
    return decideAutomationRun(id, dto, user);
  }
}
