/**
 * Execution engine for AutomationRule.steps — the multi-step sequence
 * that can pause on an APPROVAL_GATE and resume later, layered on top of
 * (not replacing) the existing flat `actions` path in ./action-handler.ts.
 * See automation-events.queue.ts's processEntityEvent for where this
 * branches in, and backend/api/src/modules/case-management/
 * automation-run-states.controller.ts for the human decision surface that
 * resumes a WAITING_APPROVAL run.
 *
 * Steps are `{type:'ACTION', actionType, params}` (identical shape to one
 * `actions` entry — reuses executeActions unchanged, one item at a time,
 * so ACTION step behavior can never drift from what Macro/flat-automation
 * actions already do) or `{type:'APPROVAL_GATE', reason?}`.
 */
import { randomUUID } from 'node:crypto';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type AutomationRule } from '@topiadesk/db';
import { executeActions, type CaseManagementEntityRef } from './action-handler';

export type AutomationStep =
  | { type: 'ACTION'; actionType: string; params?: Record<string, unknown> }
  | { type: 'APPROVAL_GATE'; reason?: string; notifyTeamId?: string };

/** Roles that hold `approval:write` per packages/db/prisma/seed.ts — the
 * only two, confirmed there rather than assumed. Used as the APPROVAL_GATE
 * notify-everyone-who-can-decide default when a step doesn't name a
 * specific team. */
const APPROVER_ROLE_NAMES = ['ADMIN', 'COMPLIANCE_OFFICER'];

function toEntityRef(entityType: 'CASE' | 'CLAIM', entityId: string): CaseManagementEntityRef {
  return entityType === 'CLAIM' ? { entityType: 'CLAIM', claimId: entityId } : { entityType: 'CASE', caseId: entityId };
}

function parseSteps(rule: AutomationRule): AutomationStep[] {
  return Array.isArray(rule.steps) ? (rule.steps as unknown as AutomationStep[]) : [];
}

/**
 * Entry point when an ENTITY_EVENT-triggered rule has `steps` set —
 * guards against a duplicate concurrent run for the same rule+entity
 * (two events firing in close succession must not start two overlapping
 * runs), then creates the run row and immediately advances it.
 */
export async function startRun(rule: AutomationRule, entityType: 'CASE' | 'CLAIM', entityId: string): Promise<void> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const existingActive = await prisma.automationRunState.findFirst({
      where: { ruleId: rule.id, entityType, entityId, status: { in: ['RUNNING', 'WAITING_APPROVAL'] } },
    });
    if (existingActive) return;

    const run = await prisma.automationRunState.create({
      data: { ruleId: rule.id, entityType, entityId, status: 'RUNNING', currentStepIndex: 0 },
    });
    await advanceRun(run.id);
  });
}

/**
 * Notifies whoever should decide a newly-opened APPROVAL_GATE — the run
 * previously created an Approval row and paused but told no one, a real
 * gap for "who to approve... when workflow starts". `step.notifyTeamId`
 * targets a specific team's members; otherwise defaults to every ACTIVE
 * user holding one of APPROVER_ROLE_NAMES (i.e. everyone who could
 * actually decide it), so a gate never opens silently. Both channels
 * (IN_APP + EMAIL) — same two-row pattern already used by
 * CasesController.requestClosure for the CASE_CLOSURE approval flow.
 * Called from inside advanceRun's own runWithRlsContext(SYSTEM_JOB_CONTEXT,
 * ...) wrapper, so no separate wrap is needed here.
 */
async function notifyApprovers(
  ruleName: string,
  step: Extract<AutomationStep, { type: 'APPROVAL_GATE' }>,
  entityType: 'CASE' | 'CLAIM',
  entityId: string,
): Promise<void> {
  const prisma = getPrismaClient();
  const recipientIds = step.notifyTeamId
    ? (await prisma.teamMember.findMany({ where: { teamId: step.notifyTeamId }, select: { userId: true } })).map((m) => m.userId)
    : (
        await prisma.user.findMany({
          where: { status: 'ACTIVE', roles: { some: { role: { name: { in: APPROVER_ROLE_NAMES } } } } },
          select: { id: true },
        })
      ).map((u) => u.id);
  if (recipientIds.length === 0) return;

  const title = `Approval needed: ${ruleName}`;
  const body = step.reason ? `A workflow step requires your approval — ${step.reason}` : 'A workflow step requires your approval.';
  await prisma.notification.createMany({
    data: recipientIds.flatMap((recipientUserId) =>
      (['IN_APP', 'EMAIL'] as const).map((channel) => ({
        recipientUserId,
        type: 'CASE_MANAGEMENT_AUTOMATION' as const,
        title,
        body,
        relatedEntityType: entityType,
        relatedEntityId: entityId,
        channel,
        status: 'PENDING' as const,
        dedupeKey: `automation-approval-gate:${entityType}:${entityId}:${recipientUserId}:${channel}:${randomUUID()}`,
      })),
    ),
  });
}

/**
 * Runs steps from `currentStepIndex` onward until it hits an
 * APPROVAL_GATE (pauses, WAITING_APPROVAL), a failed ACTION (FAILED), or
 * the end of the list (COMPLETED). Re-fetches fresh state and no-ops if
 * the run isn't RUNNING — a double-fire guard (the resume queue and a
 * stray re-trigger both landing on the same run must not double-execute
 * steps).
 */
export async function advanceRun(runStateId: string): Promise<void> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const run = await prisma.automationRunState.findUnique({ where: { id: runStateId }, include: { rule: true } });
    if (!run || run.status !== 'RUNNING') return;

    const steps = parseSteps(run.rule);
    const entityRef = toEntityRef(run.entityType, run.entityId);

    let index = run.currentStepIndex;
    for (; index < steps.length; index++) {
      const step = steps[index]!;

      if (step.type === 'APPROVAL_GATE') {
        const approval = await prisma.approval.create({
          data: {
            entityType: 'CASE_AUTOMATION_GATE',
            entityId: run.id,
            requestedById: run.rule.createdById,
            status: 'PENDING',
            reason: step.reason,
          },
        });
        await prisma.automationRunState.update({
          where: { id: run.id },
          data: { status: 'WAITING_APPROVAL', currentStepIndex: index, approvalId: approval.id },
        });
        await notifyApprovers(run.rule.name, step, run.entityType, run.entityId);
        return;
      }

      const results = await executeActions([{ actionType: step.actionType, params: step.params ?? {} }], {
        entity: entityRef,
        actingUserId: null,
        systemJobName: `automation-rule:${run.rule.name}`,
      });
      const result = results[0];
      if (!result?.ok) {
        await prisma.automationRunState.update({
          where: { id: run.id },
          data: { status: 'FAILED', currentStepIndex: index, failureReason: result?.error ?? 'Unknown action failure' },
        });
        return;
      }
    }

    await prisma.automationRunState.update({
      where: { id: run.id },
      data: { status: 'COMPLETED', currentStepIndex: index, completedAt: new Date() },
    });
  });
}
