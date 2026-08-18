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
import { loadEnv } from '@topiadesk/config';
import { getPrismaClient, getRlsContext, runWithRlsContext, SYSTEM_JOB_CONTEXT, type AutomationRule } from '@topiadesk/db';
import { executeActions, type CaseManagementEntityRef } from './action-handler';
import { getEntityMeta, type AutomationEntityType } from '@topiadesk/automation';
import { generateTeamsActionToken, hashTeamsActionToken } from './teams-action-token.util';

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

/**
 * Which fields a CONDITION step may branch on.
 *
 * Was a hardcoded two-entry map for CASE and CLAIM, which is one of the two
 * reasons multi-step workflows could not run on anything else. Now reads the
 * shared entity registry, so a branch on a policy's expiry date or an
 * opportunity's value is expressible — and the allowlist stays identical to
 * the one the rule builder offers, because it is literally the same source.
 */
function conditionFieldsFor(entityType: AutomationEntityType): readonly string[] {
  return getEntityMeta(entityType)?.fields.map((f) => f.name) ?? [];
}

/**
 * Undefined for the six entity types that are not tickets — the ticket-only
 * actions then fail with a readable message via requireTicketRef rather than
 * reading a property off a ref that cannot exist.
 */
function toEntityRef(entityType: AutomationEntityType, entityId: string): CaseManagementEntityRef | undefined {
  if (entityType === 'CLAIM') return { entityType: 'CLAIM', claimId: entityId };
  if (entityType === 'CASE') return { entityType: 'CASE', caseId: entityId };
  return undefined;
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

async function resolveConditionField(entityType: AutomationEntityType, entityId: string, field: string): Promise<string | null> {
  const meta = getEntityMeta(entityType);
  if (!meta) throw new Error(`Unknown entity type ${entityType}`);
  if (!conditionFieldsFor(entityType).includes(field)) {
    throw new Error(`"${field}" is not a valid condition field for ${entityType}`);
  }
  const prisma = getPrismaClient();
  const delegate = prisma[meta.model] as unknown as { findUnique(args: unknown): Promise<Record<string, unknown> | null> };
  const row = await delegate.findUnique({ where: { id: entityId }, select: { [field]: true } });
  return row ? String(row[field] ?? '') : null;
}

/**
 * Entry point when an ENTITY_EVENT-triggered rule has `steps` set —
 * guards against a duplicate concurrent run for the same rule+entity
 * (two events firing in close succession must not start two overlapping
 * runs), then creates the run row and immediately advances it.
 */
export async function startRun(rule: AutomationRule, entityType: AutomationEntityType, entityId: string): Promise<void> {
  // Preserves the CALLER's tenant schema. A bare SYSTEM_JOB_CONTEXT here
  // carries tenantSchema: null, and runWithRlsContext REPLACES the context
  // rather than merging — so nesting one inside processEntityEvent's already
  // tenant-bound context silently moved every multi-step run to `public`,
  // orphaning the run row from the record it was about.
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: getRlsContext()?.tenantSchema ?? null }, async () => {
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
 * ASSIGNEE_MANAGER resolves through whichever field the entity registry
 * says holds the responsible person — a case's assignee, a policy's broker
 * of record, an opportunity's owner — so "the owner's manager signs this
 * off" works on every entity type rather than only tickets. TEAM_LEAD stays
 * CASE/CLAIM-only because no other entity carries a team.
 *
 * Either falls through to the EXPLICIT default below when resolution finds
 * nobody, so a gate never opens with no one able to act on it.
 */
async function resolveApprovers(
  step: Extract<AutomationStep, { type: 'APPROVAL_GATE' }>,
  entityType: AutomationEntityType,
  entityId: string,
): Promise<ApproverResolution> {
  const prisma = getPrismaClient();
  const approverMode = step.approverMode ?? 'EXPLICIT';

  if (approverMode === 'ASSIGNEE_MANAGER') {
    // Whoever owns the record, per the registry — assignedToId on a case,
    // brokerOfRecordId on a policy, ownerId on an opportunity or client.
    const meta = getEntityMeta(entityType);
    if (meta?.ownerField) {
      const delegate = prisma[meta.model] as unknown as { findUnique(args: unknown): Promise<Record<string, unknown> | null> };
      const row = await delegate.findUnique({ where: { id: entityId }, select: { [meta.ownerField]: true } });
      const ownerId = row?.[meta.ownerField];
      if (typeof ownerId === 'string') {
        const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { managerId: true } });
        if (owner?.managerId) return { recipientIds: [owner.managerId], restrictive: true };
      }
    }
    // Resolved to nobody — fall through to EXPLICIT's own logic below.
  }

  if (approverMode === 'TEAM_LEAD' && (entityType === 'CASE' || entityType === 'CLAIM')) {
    // Team membership is a ticket concept; nothing else carries one.
    const delegate = prisma[entityType === 'CLAIM' ? 'claim' : 'case'] as unknown as {
      findUnique(args: unknown): Promise<{ assignedTeamId: string | null } | null>;
    };
    const row = await delegate.findUnique({ where: { id: entityId }, select: { assignedTeamId: true } });
    if (row?.assignedTeamId) {
      const leads = await prisma.teamMember.findMany({ where: { teamId: row.assignedTeamId, role: 'LEAD' }, select: { userId: true } });
      if (leads.length > 0) return { recipientIds: leads.map((l) => l.userId), restrictive: true };
    }
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
  entityType: AutomationEntityType,
  entityId: string,
  runStateId: string,
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

  await notifyApproversViaTeams(title, body, recipientIds, runStateId);
}

/**
 * Two-way Teams: posts a MessageCard with real Approve/Reject buttons
 * (`potentialAction: HttpPOST`, the same no-bot-required Incoming Webhook
 * mechanism NOTIFY_TEAMS_CHANNEL already uses for one-way posts — see
 * handlers.ts's own comment) to every enabled TEAMS_WEBHOOK connector, one
 * card per recipient so each button carries a token scoped to exactly that
 * person (see TeamsActionToken's schema comment). Best-effort: no enabled
 * connector, or a failed POST, silently skips this channel — the IN_APP/
 * EMAIL notifications above are already the load-bearing path, this is
 * additive.
 */
async function notifyApproversViaTeams(title: string, body: string, recipientIds: string[], runStateId: string): Promise<void> {
  const prisma = getPrismaClient();
  const connectors = await prisma.integrationConnector.findMany({ where: { connectorType: 'TEAMS_WEBHOOK', isEnabled: true } });
  if (connectors.length === 0) return;
  const tenantSchema = getRlsContext()?.tenantSchema ?? 'public';
  const env = loadEnv();

  for (const connector of connectors) {
    const config = connector.config as { webhookUrl?: string } | null;
    if (!config?.webhookUrl) continue;

    for (const recipientUserId of recipientIds) {
      const rawToken = generateTeamsActionToken();
      await prisma.teamsActionToken.create({
        data: {
          tokenHash: hashTeamsActionToken(rawToken),
          tenantSchema,
          runStateId,
          actingUserId: recipientUserId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      const approveUrl = `${env.API_URL}/integrations/teams-actions/${rawToken}?decision=APPROVED`;
      const rejectUrl = `${env.API_URL}/integrations/teams-actions/${rawToken}?decision=REJECTED`;

      try {
        const res = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            '@type': 'MessageCard',
            '@context': 'http://schema.org/extensions',
            summary: title,
            title,
            text: body,
            potentialAction: [
              { '@type': 'HttpPOST', name: 'Approve', target: approveUrl },
              { '@type': 'HttpPOST', name: 'Reject', target: rejectUrl },
            ],
          }),
        });
        if (!res.ok) {
          console.error(`[run-engine] Teams webhook POST failed for connector ${connector.id}: ${res.status}`);
        }
      } catch (err) {
        console.error(`[run-engine] Teams webhook POST threw for connector ${connector.id}`, err);
      }
    }
  }
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
  // Same reasoning as startRun: keep whatever tenant the caller established
  // (processEntityEvent, the schedule scan, or the resume queue).
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: getRlsContext()?.tenantSchema ?? null }, async () => {
    const prisma = getPrismaClient();
    const run = await prisma.automationRunState.findUnique({ where: { id: runStateId }, include: { rule: true } });
    if (!run || run.status !== 'RUNNING') return;

    // CaseManagementEntityType gained a LEAD member for AssignmentRule's
    // sake (assignment-resolver.util.ts), but this engine — CONDITION_FIELDS,
    // resolveApprovers, toEntityRef's CaseManagementEntityRef — is Case/Claim
    // only; nothing creates a LEAD AutomationRunState (startRun()'s own
    // param stays 'CASE' | 'CLAIM'). This narrows run.entityType back to
    // that pair for the rest of the function instead of widening four
    // Case/Claim-specific helpers to a value they can never actually see.
    if (run.entityType === 'LEAD') {
      console.error(`[automation] run ${run.id} has unsupported entityType LEAD — automation runs are never created for leads`);
      await prisma.automationRunState.update({ where: { id: run.id }, data: { status: 'FAILED', failureReason: 'Unsupported entityType: LEAD' } });
      return;
    }

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
        await notifyApprovers(run.rule.name, step.reason, recipientIds, run.entityType, run.entityId, run.id);
        return;
      }

      const results = await executeActions([{ actionType: step.actionType, params: step.params ?? {} }], {
        entity: entityRef,
        target: { entityType: run.entityType, id: run.entityId },
        // Multi-step runs span approval gates that can sit for days, so the
        // row loaded when the run started would be stale by the time a later
        // step executes — the handlers re-read it instead.
        targetData: null,
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
