/**
 * The missing half of the automation module: rules that run on a clock.
 *
 * `AutomationTriggerType.SCHEDULE` existed in the enum from the start, and
 * /admin/automations happily created rules with it — but nothing ever
 * consumed them. No cron column, no scan job. A rule saying "escalate any
 * ticket untouched for 48 hours" was stored, listed, badged Active, and
 * never once fired. Every genuinely valuable brokerage automation is of this
 * shape (renewal chasers, SLA escalation, dormant-lead nudges, unpaid-premium
 * follow-ups), so the absence took out most of the module's usefulness.
 *
 * How it works: wake every 5 minutes, walk the platform tenant registry, and
 * in each tenant find PUBLISHED+active SCHEDULE rules whose `nextRunAt` has
 * passed. For each, compile its conditions into a `where` clause, page
 * through the matches, and run its actions against each one.
 *
 * Two safety properties are load-bearing, because this is the only part of
 * the product that mutates records in bulk with nobody watching:
 *
 *   1. A cap on how many records one run may touch. Rules get mis-scoped —
 *      a forgotten condition turns "clients whose KYC lapses this week" into
 *      "all clients" — and the difference between catching that and not is
 *      whether the run refuses or emails four thousand people.
 *   2. Once-per-record semantics by default. A rule matching "expiring within
 *      30 days" keeps matching for thirty days; running it hourly without
 *      suppression sends the same client the same chaser 720 times. Rules opt
 *      into repeating, they don't opt out.
 */

import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type Prisma } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import {
  baselineExclusions,
  computeNextRunAt,
  conditionsToPrismaWhere,
  getEntityMeta,
  normalizeConditions,
  type AutomationEntityType,
} from '@topiadesk/automation';
import '../../automation/handlers';
import { deriveExecutionStatus, executeActions, type ActionSpec, type CaseManagementEntityRef } from '../../automation/action-handler';
import { startRun } from '../../automation/run-engine';

export const AUTOMATION_SCHEDULE_QUEUE_NAME = 'automation-schedule';
const AUTOMATION_SCHEDULE_SCHEDULER_ID = 'automation-schedule-scan';

/**
 * How often the scanner wakes. Also the floor on any rule's own cadence —
 * `MIN_SCHEDULE_INTERVAL_MS` in the shared package rejects anything finer at
 * save time, because a rule promising to run every minute on a scanner that
 * wakes every five would simply be lying to the admin who wrote it.
 */
const SCAN_INTERVAL_MS = 5 * 60_000;

export interface ScheduleScanResult {
  tenantsProcessed: number;
  rulesRun: number;
  entitiesActedOn: number;
  failures: number;
}

export async function runScheduledAutomationScan(now: Date = new Date()): Promise<ScheduleScanResult> {
  const tenants = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
    getPlatformPrismaClient().tenant.findMany({ where: { status: 'ACTIVE' }, select: { schemaName: true } }),
  );

  const result: ScheduleScanResult = { tenantsProcessed: 0, rulesRun: 0, entitiesActedOn: 0, failures: 0 };

  for (const tenant of tenants) {
    try {
      const tenantResult = await runTenantSchedules(tenant.schemaName, now);
      result.rulesRun += tenantResult.rulesRun;
      result.entitiesActedOn += tenantResult.entitiesActedOn;
      result.failures += tenantResult.failures;
      result.tenantsProcessed += 1;
    } catch (err) {
      // One tenant's broken rule must not stop every other tenant's
      // automation — the same isolation the KYC and renewal scans rely on.
      console.error(`[automation-schedule] tenant ${tenant.schemaName} failed`, err);
      result.failures += 1;
    }
  }

  return result;
}

async function runTenantSchedules(tenantSchema: string, now: Date): Promise<Omit<ScheduleScanResult, 'tenantsProcessed'>> {
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema }, async () => {
    const prisma = getPrismaClient();
    const summary = { rulesRun: 0, entitiesActedOn: 0, failures: 0 };

    const dueRules = await prisma.automationRule.findMany({
      where: {
        triggerType: 'SCHEDULE',
        isActive: true,
        status: 'PUBLISHED',
        scheduleCron: { not: null },
        // A rule that has never run has a null nextRunAt — it is due
        // immediately, which is what an admin expects after switching one on.
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      },
    });

    for (const rule of dueRules) {
      try {
        const acted = await runOneScheduledRule(rule, tenantSchema, now);
        summary.rulesRun += 1;
        summary.entitiesActedOn += acted;
      } catch (err) {
        summary.failures += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[automation-schedule] rule "${rule.name}" (${rule.id}) failed`, err);
        await prisma.automationRule
          .update({
            where: { id: rule.id },
            data: {
              lastRunAt: now,
              lastRunStatus: 'FAILED',
              lastRunError: message.slice(0, 1000),
              nextRunAt: computeNextRunAt(rule.scheduleCron ?? '', rule.scheduleTimezone, now),
            },
          })
          // A failure recording a failure must not mask the original.
          .catch(() => undefined);
      }
    }

    return summary;
  });
}

type ScheduledRule = Awaited<ReturnType<ReturnType<typeof getPrismaClient>['automationRule']['findMany']>>[number];

async function runOneScheduledRule(rule: ScheduledRule, tenantSchema: string, now: Date): Promise<number> {
  const prisma = getPrismaClient();
  const conditions = normalizeConditions(rule.conditions);
  const entityType = conditions.entityType;

  if (!entityType) {
    await finish(rule, now, 'FAILED', 'This rule does not say which kind of record it applies to.', 0);
    return 0;
  }
  const meta = getEntityMeta(entityType);
  if (!meta) {
    await finish(rule, now, 'FAILED', `Unknown record type "${entityType}".`, 0);
    return 0;
  }

  const where = {
    ...baselineExclusions(entityType),
    ...conditionsToPrismaWhere(conditions, now),
  } as Record<string, unknown>;

  const cap = conditions.maxEntitiesPerRun ?? 200;
  const delegate = prisma[meta.model] as unknown as {
    findMany(args: unknown): Promise<Record<string, unknown>[]>;
    count(args: unknown): Promise<number>;
  };

  // cap + 1 so an over-wide match is DETECTED rather than silently truncated
  // to the first N — truncation would make a mis-scoped rule look like it
  // worked while quietly acting on an arbitrary subset.
  const candidates = await delegate.findMany({ where, take: cap + 1, orderBy: { createdAt: 'asc' } });

  if (candidates.length > cap) {
    // The real total, not cap+1. This number is the admin's only measure of
    // HOW badly the rule is mis-scoped, and "201" when the truth is 5,000
    // makes an emergency look like a rounding error. One extra count, only
    // ever on the failure path.
    const trueCount = await delegate.count({ where });
    await finish(
      rule,
      now,
      'FAILED',
      `Matched ${trueCount} ${meta.pluralLabel}, which is over this rule's limit of ${cap} — it stopped rather than acting on them all. Narrow its conditions, or raise the limit if this is intended.`,
      trueCount,
    );
    return 0;
  }

  const targets = await excludeAlreadyHandled(rule, entityType, candidates, conditions.repeat);

  let acted = 0;
  for (const row of targets) {
    const entityId = String(row.id);
    const ticketRef: CaseManagementEntityRef | undefined =
      entityType === 'CLAIM' ? { entityType: 'CLAIM', claimId: entityId } : entityType === 'CASE' ? { entityType: 'CASE', caseId: entityId } : undefined;

    if (Array.isArray(rule.steps) && rule.steps.length > 0) {
      // Runs on every entity type now — AutomationRunState.entityType was
      // widened and run-engine.ts's condition fields come from the shared
      // registry, so an approval gate on an opportunity or a policy works
      // the same as one on a ticket.
      await startRun(rule, entityType, entityId);
      acted += 1;
      continue;
    }

    const actions = Array.isArray(rule.actions) ? (rule.actions as unknown as ActionSpec[]) : [];
    const results = await executeActions(actions, {
      target: { entityType, id: entityId },
      targetData: row,
      entity: ticketRef,
      actingUserId: null,
      systemJobName: `automation-rule:${rule.name}`,
    });
    await logExecution(rule, entityType, entityId, deriveExecutionStatus(results), results);
    acted += 1;
  }

  await finish(rule, now, 'OK', null, acted);
  console.log(`[automation-schedule] ${tenantSchema} "${rule.name}": ${candidates.length} matched, ${acted} acted on`);
  return acted;
}

/**
 * Drops records this rule has already handled.
 *
 * The default is once per record, forever. A condition like "expires within
 * 30 days" stays true for thirty days, so a daily rule would re-fire on the
 * same policy thirty times — and if its action is an email, the client gets
 * thirty. Repeating is therefore something a rule opts INTO:
 *
 *   - ONCE_PER_RECORD (default) — act once, ever.
 *   - EVERY_RUN — act every time it matches. Correct for idempotent actions
 *     like UPDATE_FIELD, where re-running changes nothing.
 *   - { cooldownHours: n } — act again only after n hours. The middle ground
 *     for genuine chasers ("remind weekly until it's dealt with").
 *
 * Only successful executions suppress. A record whose action failed is
 * deliberately eligible again next run, which is what makes a transient SMTP
 * outage self-heal instead of permanently skipping those clients.
 */
async function excludeAlreadyHandled(
  rule: ScheduledRule,
  entityType: AutomationEntityType,
  candidates: Record<string, unknown>[],
  repeat: ReturnType<typeof normalizeConditions>['repeat'],
): Promise<Record<string, unknown>[]> {
  if (candidates.length === 0) return candidates;
  if (repeat === 'EVERY_RUN') return candidates;

  const prisma = getPrismaClient();
  const ids = candidates.map((c) => String(c.id));
  const since =
    repeat && typeof repeat === 'object' && typeof repeat.cooldownHours === 'number'
      ? new Date(Date.now() - repeat.cooldownHours * 3_600_000)
      : undefined;

  const handled = await prisma.automationExecutionLog.findMany({
    where: {
      ruleId: rule.id,
      entityType,
      entityId: { in: ids },
      status: { in: ['SUCCESS', 'PARTIAL_FAILURE'] },
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: { entityId: true },
  });

  const seen = new Set(handled.map((h) => h.entityId));
  return candidates.filter((c) => !seen.has(String(c.id)));
}

async function logExecution(
  rule: ScheduledRule,
  entityType: string,
  entityId: string,
  status: 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED',
  results: unknown,
): Promise<void> {
  await getPrismaClient().automationExecutionLog.create({
    data: {
      ruleId: rule.id,
      ruleName: rule.name,
      entityType,
      entityId,
      triggerSource: 'SCHEDULE',
      status,
      actionResults: results as Prisma.InputJsonValue,
    },
  });
}

async function finish(
  rule: ScheduledRule,
  now: Date,
  status: 'OK' | 'FAILED' | 'SKIPPED',
  error: string | null,
  matchCount: number,
): Promise<void> {
  const nextRunAt = computeNextRunAt(rule.scheduleCron ?? '', rule.scheduleTimezone, now);
  await getPrismaClient().automationRule.update({
    where: { id: rule.id },
    data: {
      lastRunAt: now,
      lastRunStatus: status,
      lastRunError: error,
      lastMatchCount: matchCount,
      // A rule whose cron no longer parses gets a null nextRunAt, which
      // takes it out of the due query rather than retrying it every 5
      // minutes forever. lastRunError says why, on the rule itself.
      nextRunAt,
    },
  });
}

export function createAutomationScheduleQueue(connection: Redis): Queue {
  return new Queue(AUTOMATION_SCHEDULE_QUEUE_NAME, { connection });
}

export function createAutomationScheduleWorker(connection: Redis): Worker {
  return new Worker(
    AUTOMATION_SCHEDULE_QUEUE_NAME,
    async (_job: Job) => {
      const result = await runScheduledAutomationScan();
      console.log(
        `[automation-schedule] ${result.tenantsProcessed} tenant(s), ${result.rulesRun} rule(s) run, ${result.entitiesActedOn} record(s) acted on, ${result.failures} failure(s)`,
      );
      return result;
    },
    { connection },
  );
}

export async function scheduleAutomationScan(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(AUTOMATION_SCHEDULE_SCHEDULER_ID, { every: SCAN_INTERVAL_MS }, { name: 'scan' });
}
