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
 * actions already do), `{type:'APPROVAL_GATE', ...}`, or
 * `{type:'CONDITION', ...}` (branches on a fixed set of Case/Claim
 * fields). Every step also carries a stable `id`, addressable by a
 * `goto` — this is what makes branching/routing possible. Older
 * persisted rows predating this simply have no `id`/goto on their steps;
 * `withStepIds()` below defensively synthesizes index-based ids for those
 * purely so the resolution helpers have something to key off, and since
 * such rows never reference a goto, execution stays byte-for-byte
 * identical to before this file changed.
 */
import { randomUUID } from 'node:crypto';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type AutomationRule } from '@topiadesk/db';
import { executeActions, type CaseManagementEntityRef } from './action-handler';

export type AutomationStep =
  | { id: string; type: 'ACTION'; actionType: string; params?: Record<string, unknown> }
  | {
      id: string;
      type: 'APPROVAL_GATE';
      reason?: string;
      notifyTeamId?: string;
      /** Named individual approvers — searchable-picker output. Non-empty
       * turns on decision-time allow-list enforcement (see
       * automation-run-states.controller.ts); absent/empty preserves
       * today's unrestricted-decider behavior. */
      approverUserIds?: string[];
      /** Default EXPLICIT (today's notifyTeamId/approverUserIds behavior,
       * unchanged). ASSIGNEE_MANAGER/TEAM_LEAD dynamically resolve the
       * decider from the case at gate-open time (CASE only — no
       * equivalent concept exists for Claim) instead of a fixed list; if
       * resolution finds nobody (unassigned ticket, no manager set, team
       * has no LEAD), falls back to the same permission-based default
       * EXPLICIT-with-nothing-configured already uses, so a gate never
       * opens with no one able to act on it. See resolveApprovers(). */
      approverMode?: 'EXPLICIT' | 'ASSIGNEE_MANAGER' | 'TEAM_LEAD';
      /** Quorum among approverUserIds. Default 1 (today's single-Approval
       * behavior). >1 routes through an ApprovalChain instead. */
      requiredApprovals?: number;
      /** Step id to jump to once the gate is fully approved. Omitted =
       * today's behavior (fall through to the next array index). */
      onApprove?: { goto?: string };
      /** Step id to jump to on rejection. Omitted = today's behavior (the
       * whole run fails). */
      onReject?: { goto?: string };
    }
  | {
      id: string;
      type: 'CONDITION';
      field: string;
      operator: 'EQUALS' | 'NOT_EQUALS';
      value: string;
      /** Omitted goto = ends the run normally (COMPLETED) on that branch —
       * matters for a workflow whose only step is a CONDITION, which
       * would otherwise have no valid step to target at all (found live:
       * a single-CONDITION-step workflow could never be published, since
       * the builder's "go to" picker excludes the step itself and there
       * was nothing else to point to). Mirrors APPROVAL_GATE's
       * onApprove/onReject, which already treat an omitted goto as a
       * sensible default rather than requiring one. */
      onTrue: { goto?: string };
      onFalse: { goto?: string };
    };

/** Roles that hold `approval:write` per packages/db/prisma/seed.ts — the
 * only two, confirmed there rather than assumed. Used as the APPROVAL_GATE
 * notify-everyone-who-can-decide default when a step doesn't name a
 * specific team or specific approvers. */
const APPROVER_ROLE_NAMES = ['ADMIN', 'COMPLIANCE_OFFICER'];

/** Fixed, per-entityType allow-list of fields a CONDITION step may branch
 * on — deliberately the same set the builder's own "Conditions" card
 * already exposes; no custom-field conditions in this pass. */
const CONDITION_FIELDS: Record<'CASE' | 'CLAIM', readonly string[]> = {
  CASE: ['status', 'priority', 'caseType', 'categoryId', 'assignedTeamId'],
  CLAIM: ['status', 'priority', 'assignedTeamId'],
};

function toEntityRef(entityType: 'CASE' | 'CLAIM', entityId: string): CaseManagementEntityRef {
  return entityType === 'CLAIM' ? { entityType: 'CLAIM', claimId: entityId } : { entityType: 'CASE', caseId: entityId };
}

function withStepIds(raw: unknown): AutomationStep[] {
  if (!Array.isArray(raw)) return [];
  return (raw as AutomationStep[]).map((step, index) => (step.id ? step : { ...step, id: `step-${index}` }));
}

function parseSteps(rule: AutomationRule): AutomationStep[] {
  return withStepIds(rule.steps);
}

/** Throws a readable error (surfaced as AutomationRunState.FAILED with a
 * descriptive failureReason, not a silent hang) if a stored goto target no
 * longer exists — can happen if a workflow is edited after a run already
 * started. */
function stepIndexById(steps: AutomationStep[], id: string): number {
  const index = steps.findIndex((s) => s.id === id);
  if (index === -1) {
    throw new Error(`Workflow step "${id}" not found — the workflow may have been edited after this run started.`);
  }
  return index;
}

async function resolveConditionField(entityType: 'CASE' | 'CLAIM', entityId: string, field: string): Promise<string | null> {
  if (!CONDITION_FIELDS[entityType].includes(field)) {
    throw new Error(`"${field}" is not a valid condition field for ${entityType}`);
  }
  const prisma = getPrismaClient();
  if (entityType === 'CLAIM') {
    const claim = await prisma.claim.findUnique({ where: { id: entityId }, select: { [field]: true } as never });
    return claim ? String((claim as Record<string, unknown>)[field] ?? '') : null;
  }
  const kase = await prisma.case.findUnique({ where: { id: entityId }, select: { [field]: true } as never });
  return kase ? String((kase as Record<string, unknown>)[field] ?? '') : null;
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

interface ApproverResolution {
  recipientIds: string[];
  /** True when recipientIds is a genuinely narrow/intended set of
   * deciders (explicit named people, or a resolved manager/team-lead) —
   * drives context.approverAllowlist for decision-time enforcement in
   * advanceRun below. False for the permission-based "anyone who can
   * decide" default AND for today's team-notify-without-restriction case
   * (notifyTeamId alone never narrowed who could decide, and that stays
   * unchanged — only ASSIGNEE_MANAGER/TEAM_LEAD and named approverUserIds
   * are treated as restrictive).
   */
  restrictive: boolean;
}

/**
 * Single resolution point for "who should decide this APPROVAL_GATE",
 * used by both advanceRun (to set/skip the decision-time allow-list) and
 * notifyApprovers (to know who to notify) — one DB round-trip per gate
 * open, not two independently-computed answers that could drift apart.
 * ASSIGNEE_MANAGER/TEAM_LEAD only apply to CASE (Claim has no assignee/
 * team-lead concept here); either falls through to today's EXPLICIT
 * default (below) if resolution finds nobody, so a gate never opens with
 * no one able to act on it.
 */
async function resolveApprovers(
  step: Extract<AutomationStep, { type: 'APPROVAL_GATE' }>,
  entityType: 'CASE' | 'CLAIM',
  entityId: string,
): Promise<ApproverResolution> {
  const prisma = getPrismaClient();
  const approverMode = step.approverMode ?? 'EXPLICIT';

  if ((approverMode === 'ASSIGNEE_MANAGER' || approverMode === 'TEAM_LEAD') && entityType === 'CASE') {
    const kase = await prisma.case.findUnique({ where: { id: entityId }, select: { assignedToId: true, assignedTeamId: true } });
    if (approverMode === 'ASSIGNEE_MANAGER' && kase?.assignedToId) {
      const assignee = await prisma.user.findUnique({ where: { id: kase.assignedToId }, select: { managerId: true } });
      if (assignee?.managerId) return { recipientIds: [assignee.managerId], restrictive: true };
    }
    if (approverMode === 'TEAM_LEAD' && kase?.assignedTeamId) {
      const leads = await prisma.teamMember.findMany({ where: { teamId: kase.assignedTeamId, role: 'LEAD' }, select: { userId: true } });
      if (leads.length > 0) return { recipientIds: leads.map((l) => l.userId), restrictive: true };
    }
    // Resolved to nobody — fall through to EXPLICIT's own logic below.
  }

  const approverUserIds = step.approverUserIds ?? [];
  if (step.notifyTeamId || approverUserIds.length > 0) {
    const teamMemberIds = step.notifyTeamId
      ? (await prisma.teamMember.findMany({ where: { teamId: step.notifyTeamId }, select: { userId: true } })).map((m) => m.userId)
      : [];
    return { recipientIds: [...new Set([...teamMemberIds, ...approverUserIds])], restrictive: approverUserIds.length > 0 };
  }

  const fallbackIds = (
    await prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { name: { in: APPROVER_ROLE_NAMES } } } } },
      select: { id: true },
    })
  ).map((u) => u.id);
  return { recipientIds: fallbackIds, restrictive: false };
}

/**
 * Notifies whoever should decide a newly-opened APPROVAL_GATE — the run
 * previously created an Approval row and paused but told no one, a real
 * gap for "who to approve... when workflow starts". Both channels
 * (IN_APP + EMAIL) — same two-row pattern already used by
 * CasesController.requestClosure for the CASE_CLOSURE approval flow.
 * Called from inside advanceRun's own runWithRlsContext(SYSTEM_JOB_CONTEXT,
 * ...) wrapper, so no separate wrap is needed here. Takes the already-
 * resolved recipient list (see resolveApprovers) rather than re-resolving
 * it, so gate-open notification and decision-time enforcement can never
 * disagree about who's eligible.
 */
async function notifyApprovers(
  ruleName: string,
  reason: string | undefined,
  recipientIds: string[],
  entityType: 'CASE' | 'CLAIM',
  entityId: string,
): Promise<void> {
  if (recipientIds.length === 0) return;
  const prisma = getPrismaClient();
  const title = `Approval needed: ${ruleName}`;
  const body = reason ? `A workflow step requires your approval — ${reason}` : 'A workflow step requires your approval.';
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
 * the end of the list (COMPLETED) — jumping around via CONDITION/goto
 * rather than always advancing by one. Re-fetches fresh state and no-ops
 * if the run isn't RUNNING — a double-fire guard (the resume queue and a
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

    let index: number | null = run.currentStepIndex;
    while (index !== null && index < steps.length) {
      const step: AutomationStep = steps[index]!;

      if (step.type === 'CONDITION') {
        const actual = await resolveConditionField(run.entityType, run.entityId, step.field);
        const matches: boolean = step.operator === 'EQUALS' ? actual === step.value : actual !== step.value;
        const target: string | undefined = matches ? step.onTrue.goto : step.onFalse.goto;
        // No goto on the taken branch = end the run normally here, same
        // as falling off the end of the steps array (COMPLETED) — see
        // the CONDITION case's doc comment on AutomationStep above.
        index = target ? stepIndexById(steps, target) : null;
        continue;
      }

      if (step.type === 'APPROVAL_GATE') {
        const requiredApprovals = step.requiredApprovals ?? 1;
        const { recipientIds, restrictive } = await resolveApprovers(step, run.entityType, run.entityId);
        const context = restrictive ? { approverAllowlist: recipientIds } : undefined;

        if (requiredApprovals > 1) {
          const chain = await prisma.approvalChain.create({
            data: { entityType: 'CASE_AUTOMATION_GATE', entityId: run.id, requiredApprovals, status: 'PENDING' },
          });
          await prisma.automationRunState.update({
            where: { id: run.id },
            data: { status: 'WAITING_APPROVAL', currentStepIndex: index, chainId: chain.id, context },
          });
        } else {
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
            data: { status: 'WAITING_APPROVAL', currentStepIndex: index, approvalId: approval.id, context },
          });
        }
        await notifyApprovers(run.rule.name, step.reason, recipientIds, run.entityType, run.entityId);
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
      index = index + 1;
    }

    await prisma.automationRunState.update({
      where: { id: run.id },
      data: { status: 'COMPLETED', currentStepIndex: steps.length, completedAt: new Date() },
    });
  });
}
