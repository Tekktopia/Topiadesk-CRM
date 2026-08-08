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

/** Mirrors (duplicated, not imported — separate deployable, see
 * backend/worker/src/automation/run-engine.ts's own copy) the step-id
 * resolution the engine uses for goto targets. Older persisted rows
 * predating branching have no `id` on their steps; the `step-${index}`
 * fallback exists purely so this stays consistent with the engine's own
 * synthesis — such rows never actually reference a goto in practice. */
interface AutomationStepLike {
  id?: string;
  type?: string;
  onApprove?: { goto?: string };
  onReject?: { goto?: string };
}

function withStepIds(raw: unknown): AutomationStepLike[] {
  if (!Array.isArray(raw)) return [];
  return (raw as AutomationStepLike[]).map((step, index) => (step.id ? step : { ...step, id: `step-${index}` }));
}

function resolveGoalIndex(steps: AutomationStepLike[], targetId: string): number {
  const index = steps.findIndex((s) => s.id === targetId);
  if (index === -1) {
    throw new NotFoundException(`Workflow step "${targetId}" not found — the workflow may have been edited since this run started.`);
  }
  return index;
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
   * Decides whatever is blocking a WAITING_APPROVAL run and, once fully
   * decided, resumes execution — either the next array index (today's
   * default) or the step named by the gate's `onApprove`/`onReject.goto`
   * (new — see run-engine.ts's AutomationStep doc comment). Branches on
   * `run.chainId` (new: multi-approver quorum, requiredApprovals > 1,
   * mirrors PolicyVersionController's decideChainedApproval()) vs
   * `run.approvalId` (existing: single approver). Segregation of duties —
   * the rule's own author (AutomationRule.createdById) can never decide
   * their own rule's gate — applies to both paths.
   */
  @Post(':id/decision')
  @RequirePermission('approval', 'write')
  @ApiOkResponse({ type: AutomationRunStateResponseDto })
  async decide(@Param('id') id: string, @Body() dto: DecideAutomationRunDto, @CurrentUser() user: AuthenticatedUser): Promise<AutomationRunStateResponseDto> {
    const prisma = getPrismaClient();
    const run = await prisma.automationRunState.findUnique({ where: { id }, include: { rule: true } });
    if (!run) throw new NotFoundException('AutomationRunState not found');
    if (run.status !== 'WAITING_APPROVAL' || (!run.approvalId && !run.chainId)) {
      throw new NotFoundException('This run is not awaiting a decision');
    }

    // Named-approver allow-list, frozen at gate-open time onto
    // run.context (see run-engine.ts) — absent means today's unrestricted
    // behavior (any approval:write holder may decide), unchanged.
    const context = run.context as { approverAllowlist?: string[] } | null;
    if (context?.approverAllowlist && !context.approverAllowlist.includes(user.id)) {
      throw new ForbiddenException('You are not an approver for this step');
    }

    const steps = withStepIds(run.rule.steps);
    const gateStep = steps[run.currentStepIndex];

    if (run.chainId) {
      return this.decideChainedGate(id, run, run.chainId, dto, user, gateStep, steps);
    }
    return this.decideSingleGate(id, run, run.approvalId!, dto, user, gateStep, steps);
  }

  private async decideSingleGate(
    id: string,
    run: AutomationRunState,
    approvalId: string,
    dto: DecideAutomationRunDto,
    user: AuthenticatedUser,
    gateStep: AutomationStepLike | undefined,
    steps: AutomationStepLike[],
  ): Promise<AutomationRunStateResponseDto> {
    const prisma = getPrismaClient();
    const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
    if (!approval || approval.status !== 'PENDING') {
      throw new NotFoundException('No pending approval for this run');
    }
    if (approval.requestedById === user.id) {
      throw new ForbiddenException("Cannot decide your own rule's approval gate");
    }

    if (dto.decision === 'APPROVED') {
      await prisma.approval.update({
        where: { id: approval.id },
        data: { status: 'APPROVED', approvedById: user.id, decidedAt: new Date(), decisionNote: dto.note },
      });
      const nextIndex = gateStep?.onApprove?.goto ? resolveGoalIndex(steps, gateStep.onApprove.goto) : run.currentStepIndex + 1;
      const updated = await prisma.automationRunState.update({
        where: { id },
        data: { status: 'RUNNING', currentStepIndex: nextIndex },
        include: { rule: { select: { name: true } } },
      });
      await enqueueAutomationRunResume(id).catch(() => undefined);
      return toResponse(updated);
    }

    await prisma.approval.update({
      where: { id: approval.id },
      data: { status: 'REJECTED', approvedById: user.id, decidedAt: new Date(), decisionNote: dto.note },
    });
    return this.resumeOrFailAfterRejection(id, run, gateStep, steps);
  }

  /**
   * Each decision on a chain appends its OWN Approval row (chainId set)
   * rather than mutating a single shared row — mirrors
   * PolicyVersionController.decideChainedApproval() exactly: REJECTED the
   * instant any one approver rejects, APPROVED only once
   * `requiredApprovals` distinct APPROVED rows exist.
   */
  private async decideChainedGate(
    id: string,
    run: AutomationRunState & { rule: { name: string; createdById: string } },
    chainId: string,
    dto: DecideAutomationRunDto,
    user: AuthenticatedUser,
    gateStep: AutomationStepLike | undefined,
    steps: AutomationStepLike[],
  ): Promise<AutomationRunStateResponseDto> {
    const prisma = getPrismaClient();
    const chain = await prisma.approvalChain.findUnique({ where: { id: chainId } });
    if (!chain || chain.status !== 'PENDING') {
      throw new NotFoundException('No pending approval for this run');
    }
    if (run.rule.createdById === user.id) {
      throw new ForbiddenException("Cannot decide your own rule's approval gate");
    }
    const alreadyDecided = await prisma.approval.findFirst({ where: { chainId, approvedById: user.id } });
    if (alreadyDecided) {
      throw new ForbiddenException('You have already decided on this approval');
    }

    if (dto.decision === 'REJECTED') {
      await prisma.approval.create({
        data: {
          entityType: 'CASE_AUTOMATION_GATE',
          entityId: run.id,
          requestedById: run.rule.createdById,
          approvedById: user.id,
          status: 'REJECTED',
          decidedAt: new Date(),
          decisionNote: dto.note,
          chainId,
        },
      });
      await prisma.approvalChain.update({ where: { id: chainId }, data: { status: 'REJECTED' } });
      return this.resumeOrFailAfterRejection(id, run, gateStep, steps);
    }

    await prisma.approval.create({
      data: {
        entityType: 'CASE_AUTOMATION_GATE',
        entityId: run.id,
        requestedById: run.rule.createdById,
        approvedById: user.id,
        status: 'APPROVED',
        decidedAt: new Date(),
        decisionNote: dto.note,
        chainId,
      },
    });
    const approvedCount = await prisma.approval.count({ where: { chainId, status: 'APPROVED' } });
    if (approvedCount < chain.requiredApprovals) {
      return toResponse(run);
    }

    await prisma.approvalChain.update({ where: { id: chainId }, data: { status: 'APPROVED' } });
    const nextIndex = gateStep?.onApprove?.goto ? resolveGoalIndex(steps, gateStep.onApprove.goto) : run.currentStepIndex + 1;
    const updated = await prisma.automationRunState.update({
      where: { id },
      data: { status: 'RUNNING', currentStepIndex: nextIndex },
      include: { rule: { select: { name: true } } },
    });
    await enqueueAutomationRunResume(id).catch(() => undefined);
    return toResponse(updated);
  }

  /** Shared by both decision paths' reject branch — routes to
   * `onReject.goto` when the gate configured one, otherwise preserves
   * today's exact behavior (the whole run FAILs). */
  private async resumeOrFailAfterRejection(
    id: string,
    run: AutomationRunState,
    gateStep: AutomationStepLike | undefined,
    steps: AutomationStepLike[],
  ): Promise<AutomationRunStateResponseDto> {
    const prisma = getPrismaClient();
    const rejectGoto = gateStep?.onReject?.goto;
    if (rejectGoto) {
      const nextIndex = resolveGoalIndex(steps, rejectGoto);
      const updated = await prisma.automationRunState.update({
        where: { id },
        data: { status: 'RUNNING', currentStepIndex: nextIndex },
        include: { rule: { select: { name: true } } },
      });
      await enqueueAutomationRunResume(id).catch(() => undefined);
      return toResponse(updated);
    }
    const updated = await prisma.automationRunState.update({
      where: { id },
      data: { status: 'FAILED', failureReason: 'Approval rejected' },
      include: { rule: { select: { name: true } } },
    });
    return toResponse(updated);
  }
}
