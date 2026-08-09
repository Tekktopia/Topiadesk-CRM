/**
 * The SLA breach-scan — structurally identical to
 * ../renewal-alerts/renewal-scan.job.ts (read that file's header comment
 * first, it's the template this one follows): Postgres-durable
 * poll-column (SlaClock.dueAt, same role as RenewalSchedule.nextAlertDueAt)
 * rather than scheduling far in advance in Redis, plus the same two-layer
 * idempotency — Notification.dedupeKey's unique constraint (load-bearing,
 * a P2002 on create is a no-op not a failure) backed by
 * `upsertJobScheduler`'s scheduler-id-keyed, boot-safe repeat registration.
 *
 * Two passes per tick, both under SYSTEM_JOB_CONTEXT (a background scan
 * needs to see every org-wide SlaClock, not whatever a request-scoped user
 * could see — RLS fails closed without a bound context):
 *  1. RUNNING clocks whose dueAt has passed -> BREACHED, notify the
 *     assignee (Claim.adjusterId / Case.assignedToId).
 *  2. BREACHED clocks past their SlaTarget.escalateAfterMinutes window,
 *     not yet escalated -> escalatedAt set, notify
 *     escalateToUserId/escalateToTeamId (team escalation fans out to every
 *     TeamMember individually — Notification.recipientUserId is a single
 *     required FK, there's no team-broadcast notification shape in this
 *     schema).
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type SlaClock, type SlaTarget } from '@topiadesk/db';
import { executeActions, type ActionSpec, type CaseManagementEntityRef } from '../../automation/action-handler';
// Side-effect import — registers every actionType (SEND_NOTIFICATION,
// SEND_EMAIL, ASSIGN_TO_USER, ...) into action-handler.ts's module-level
// registry. Already happens as a side effect of automation-events.queue.ts
// being imported elsewhere in this same worker process, but importing it
// here too makes this file correct in isolation rather than depending on
// import order elsewhere — Node caches the module, so this is a no-op if
// it already ran.
import '../../automation/handlers';

export const SLA_BREACH_SCAN_QUEUE_NAME = 'sla-breach-scan';
const SLA_BREACH_SCAN_SCHEDULER_ID = 'sla-breach-scan-scheduler';
const SLA_BREACH_SCAN_INTERVAL_MS = 5 * 60 * 1000; // SLA breaches are more time-sensitive than the 15-minute renewal-alert cadence

export interface SlaBreachScanResult {
  breachedCount: number;
  breachNotificationsCreated: number;
  breachNotificationsDeduped: number;
  escalatedCount: number;
  escalationNotificationsCreated: number;
  escalationNotificationsDeduped: number;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'P2002';
}

/** SlaTarget.onBreachActions/onEscalateActions — null/empty means "use the
 * hardcoded notify() path below", the exact pre-existing behavior for
 * every SlaTarget that hasn't opted into configurable actions. A light
 * runtime filter (not full schema validation — same trust level the admin
 * UI's own save already applies) guards against a malformed stored value
 * silently doing nothing instead of throwing mid-scan. */
function parseActionSpecs(json: unknown): ActionSpec[] | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const specs = json.filter(
    (item): item is ActionSpec => typeof item === 'object' && item !== null && typeof (item as { actionType?: unknown }).actionType === 'string',
  );
  return specs.length > 0 ? specs : null;
}

function toEntityRef(clock: Pick<SlaClock, 'claimId' | 'caseId'>): CaseManagementEntityRef {
  return clock.claimId ? { entityType: 'CLAIM', claimId: clock.claimId } : { entityType: 'CASE', caseId: clock.caseId! };
}

async function notify(
  recipientUserId: string,
  dedupeKey: string,
  title: string,
  body: string,
  entityType: 'CLAIM' | 'CASE',
  entityId: string,
): Promise<'created' | 'deduped'> {
  const prisma = getPrismaClient();
  try {
    await prisma.notification.create({
      data: {
        recipientUserId,
        type: 'SLA_BREACH',
        title,
        body,
        relatedEntityType: entityType,
        relatedEntityId: entityId,
        channel: 'IN_APP',
        status: 'PENDING',
        dedupeKey,
      },
    });
    return 'created';
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return 'deduped';
    throw err;
  }
}

export async function runSlaBreachScan(now: Date = new Date()): Promise<SlaBreachScanResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const result: SlaBreachScanResult = {
      breachedCount: 0,
      breachNotificationsCreated: 0,
      breachNotificationsDeduped: 0,
      escalatedCount: 0,
      escalationNotificationsCreated: 0,
      escalationNotificationsDeduped: 0,
    };

    // --- Pass 1: RUNNING -> BREACHED -----------------------------------
    const dueClocks = await prisma.slaClock.findMany({
      where: { status: 'RUNNING', dueAt: { lte: now } },
      include: { slaTarget: true },
    });

    for (const clock of dueClocks) {
      await prisma.slaClock.update({ where: { id: clock.id }, data: { status: 'BREACHED', breachedAt: now } });
      result.breachedCount++;

      const entityType: 'CLAIM' | 'CASE' = clock.claimId ? 'CLAIM' : 'CASE';
      const entityId = (clock.claimId ?? clock.caseId)!;

      const configuredActions = parseActionSpecs(clock.slaTarget.onBreachActions);
      if (configuredActions) {
        const outcomes = await executeActions(configuredActions, { entity: toEntityRef(clock), actingUserId: null, systemJobName: 'sla-breach-scan' });
        for (const outcome of outcomes) {
          if (outcome.ok) result.breachNotificationsCreated++;
          else console.error(`[sla-breach-scan] configured onBreachActions "${outcome.actionType}" failed for SlaClock ${clock.id}: ${outcome.error}`);
        }
        continue;
      }

      const recipientUserId = await resolveAssigneeUserId(clock);
      if (!recipientUserId) {
        console.warn(`[sla-breach-scan] SlaClock ${clock.id} (${entityType} ${entityId}) breached with no assignee to notify`);
        continue;
      }

      const outcome = await notify(
        recipientUserId,
        `sla-breach:${entityId}:${clock.slaTargetId}`,
        `SLA breached: ${clock.slaTarget.metricType} target missed`,
        `The ${clock.slaTarget.metricType} SLA target (${clock.slaTarget.targetMinutes} min) for ${entityType.toLowerCase()} ${entityId} was due at ${clock.dueAt.toISOString()} and has been breached.`,
        entityType,
        entityId,
      );
      if (outcome === 'created') result.breachNotificationsCreated++;
      else result.breachNotificationsDeduped++;
    }

    // --- Pass 2: BREACHED -> escalate -----------------------------------
    const breachedClocks = await prisma.slaClock.findMany({
      where: { status: 'BREACHED', escalatedAt: null, breachedAt: { not: null } },
      include: { slaTarget: true },
    });

    for (const clock of breachedClocks) {
      const target = clock.slaTarget;
      if (target.escalateAfterMinutes == null) continue;
      const configuredActions = parseActionSpecs(target.onEscalateActions);
      // Configured actions don't need the legacy escalateToUserId/TeamId
      // fields at all — that guard only makes sense for the hardcoded
      // notify() path below.
      if (!configuredActions && !target.escalateToUserId && !target.escalateToTeamId) continue;

      const escalateAt = new Date(clock.breachedAt!.getTime() + target.escalateAfterMinutes * 60_000);
      if (escalateAt > now) continue;

      const entityType: 'CLAIM' | 'CASE' = clock.claimId ? 'CLAIM' : 'CASE';
      const entityId = (clock.claimId ?? clock.caseId)!;

      if (configuredActions) {
        const outcomes = await executeActions(configuredActions, { entity: toEntityRef(clock), actingUserId: null, systemJobName: 'sla-breach-scan' });
        for (const outcome of outcomes) {
          if (outcome.ok) result.escalationNotificationsCreated++;
          else console.error(`[sla-breach-scan] configured onEscalateActions "${outcome.actionType}" failed for SlaClock ${clock.id}: ${outcome.error}`);
        }
        await prisma.slaClock.update({ where: { id: clock.id }, data: { escalatedAt: now } });
        result.escalatedCount++;
        continue;
      }

      const recipients = new Set<string>();
      if (target.escalateToUserId) recipients.add(target.escalateToUserId);
      if (target.escalateToTeamId) {
        const members = await prisma.teamMember.findMany({ where: { teamId: target.escalateToTeamId } });
        for (const member of members) recipients.add(member.userId);
      }

      let anyCreated = false;
      for (const recipientUserId of recipients) {
        const outcome = await notify(
          recipientUserId,
          `sla-breach-escalation:${entityId}:${clock.slaTargetId}:${recipientUserId}`,
          `SLA escalation: ${target.metricType} target breached and unresolved`,
          `The ${target.metricType} SLA target for ${entityType.toLowerCase()} ${entityId} has been breached for over ${target.escalateAfterMinutes} minute(s) and needs attention.`,
          entityType,
          entityId,
        );
        if (outcome === 'created') {
          result.escalationNotificationsCreated++;
          anyCreated = true;
        } else {
          result.escalationNotificationsDeduped++;
        }
      }

      // escalatedAt is set once a notification attempt was made for every
      // resolved recipient this tick, even if every one of them deduped
      // (a prior tick already handled it) — anyCreated only affects the
      // counters above, not whether escalatedAt advances, since re-running
      // this same clock forever would otherwise re-derive the identical
      // (fully-deduped) recipient set on every future tick for no reason.
      void anyCreated;
      await prisma.slaClock.update({ where: { id: clock.id }, data: { escalatedAt: now } });
      result.escalatedCount++;
    }

    return result;
  });
}

async function resolveAssigneeUserId(clock: SlaClock & { slaTarget: SlaTarget }): Promise<string | null> {
  const prisma = getPrismaClient();
  if (clock.claimId) {
    const claim = await prisma.claim.findUnique({ where: { id: clock.claimId } });
    return claim?.adjusterId ?? null;
  }
  if (clock.caseId) {
    const kase = await prisma.case.findUnique({ where: { id: clock.caseId } });
    return kase?.assignedToId ?? null;
  }
  return null;
}

export function createSlaBreachScanQueue(connection: Redis): Queue {
  return new Queue(SLA_BREACH_SCAN_QUEUE_NAME, { connection });
}

export function createSlaBreachScanWorker(connection: Redis): Worker {
  return new Worker(
    SLA_BREACH_SCAN_QUEUE_NAME,
    async (_job: Job) => {
      const result = await runSlaBreachScan();
      console.log(
        `[sla-breach-scan] ${result.breachedCount} clock(s) breached (${result.breachNotificationsCreated} notified, ${result.breachNotificationsDeduped} deduped); ${result.escalatedCount} escalated (${result.escalationNotificationsCreated} notified, ${result.escalationNotificationsDeduped} deduped)`,
      );
      return result;
    },
    { connection },
  );
}

/** Safe to call on every worker boot — upsertJobScheduler is idempotent by SLA_BREACH_SCAN_SCHEDULER_ID, same boot-safe pattern as scheduleRenewalScan. */
export async function scheduleSlaBreachScan(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(SLA_BREACH_SCAN_SCHEDULER_ID, { every: SLA_BREACH_SCAN_INTERVAL_MS }, { name: 'scan' });
}
