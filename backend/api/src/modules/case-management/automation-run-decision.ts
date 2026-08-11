import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getPrismaClient, type AutomationRunState } from '@topiadesk/db';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AutomationRunStateResponseDto, DecideAutomationRunDto } from './dto/automation-run-state.dto';
import { enqueueAutomationRunResume } from './automation-run-resume.util';

/**
 * The full body of AutomationRunStatesController.decide() — extracted
 * verbatim (pure code motion, no logic changes) so it has a SECOND real
 * caller: teams-actions.controller.ts's inbound "Approve"/"Reject" button
 * callback (see that file's header comment for the two-way Microsoft Teams
 * integration this enables). The HTTP controller method is now a thin
 * wrapper around this function — same behavior, same route, unchanged for
 * every existing caller.
 */
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

export async function decideAutomationRun(id: string, dto: DecideAutomationRunDto, user: AuthenticatedUser): Promise<AutomationRunStateResponseDto> {
  const prisma = getPrismaClient();
  const run = await prisma.automationRunState.findUnique({ where: { id }, include: { rule: true } });
  if (!run) throw new NotFoundException('AutomationRunState not found');
  if (run.status !== 'WAITING_APPROVAL' || (!run.approvalId && !run.chainId)) {
    throw new NotFoundException('This run is not awaiting a decision');
  }

  const context = run.context as { approverAllowlist?: string[] } | null;
  if (context?.approverAllowlist && !context.approverAllowlist.includes(user.id)) {
    const now = new Date();
    const standingIn = await prisma.approvalDelegation.findFirst({
      where: { delegateId: user.id, delegatorId: { in: context.approverAllowlist }, startsAt: { lte: now }, endsAt: { gte: now } },
    });
    if (!standingIn) {
      throw new ForbiddenException('You are not an approver for this step');
    }
  }

  const steps = withStepIds(run.rule.steps);
  const gateStep = steps[run.currentStepIndex];

  if (run.chainId) {
    return decideChainedGate(id, run, run.chainId, dto, user, gateStep, steps);
  }
  return decideSingleGate(id, run, run.approvalId!, dto, user, gateStep, steps);
}

async function decideSingleGate(
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
  return resumeOrFailAfterRejection(id, run, gateStep, steps);
}

async function decideChainedGate(
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
    return resumeOrFailAfterRejection(id, run, gateStep, steps);
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

async function resumeOrFailAfterRejection(
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
