/**
 * Recomputes `Opportunity.dealHealthScore` — a 0-100 "is this deal on
 * track" signal, distinct from `probability` (a human-set/stage-default
 * forecast weight, never touched by this job). Only computed for OPEN
 * opportunities (pipelineStage.isWon=false AND isLost=false, same predicate
 * OpportunitiesController.list()'s `isOpen` filter and dashboards.
 * controller.ts's operational-kpis use) — closed deals get a null score,
 * same "nothing left to score" reasoning as Account.healthScore staying
 * null for a policy-less account.
 *
 * Two equally-weighted sub-scores, both always applicable to an open deal
 * (unlike Account's renewal/payment signals, which need underlying rows to
 * exist at all):
 *  - Overdue: days past `expectedCloseDate` (not yet due = 100).
 *  - Engagement: days since the most recent Activity.occurredAt tied to
 *    this opportunity, falling back to `createdAt` for a deal with no
 *    logged activity yet — a brand-new deal isn't "stale", it just hasn't
 *    had time to be.
 *
 * Deliberately does NOT reconstruct "time in current stage" from the audit
 * log (see OpportunitiesController.stageHistory()'s own comment on why
 * that reconstruction exists) — doable in principle, but a real added-
 * complexity/JSONB-diff cost for a bulk org-wide job with uncertain signal
 * value over the two above; can be added later if it proves worth it.
 *
 * Same bulk-findMany + in-JS-Map-by-id aggregation style as
 * refresh-health-score.job.ts, same hourly cadence.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';

export const DEAL_HEALTH_REFRESH_QUEUE_NAME = 'deal-health-refresh';
const DEAL_HEALTH_REFRESH_SCHEDULER_ID = 'deal-health-refresh-scheduler';
const DEAL_HEALTH_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

function overdueScore(expectedCloseDate: Date, now: Date): number {
  const daysOverdue = Math.floor((now.getTime() - expectedCloseDate.getTime()) / (24 * 60 * 60 * 1000));
  if (daysOverdue <= 0) return 100;
  if (daysOverdue <= 7) return 60;
  if (daysOverdue <= 30) return 30;
  return 0;
}

function engagementScore(lastTouch: Date, now: Date): number {
  const daysSince = Math.floor((now.getTime() - lastTouch.getTime()) / (24 * 60 * 60 * 1000));
  if (daysSince <= 7) return 100;
  if (daysSince <= 14) return 60;
  if (daysSince <= 30) return 30;
  return 0;
}

export interface DealHealthRefreshResult {
  opportunitiesScored: number;
  closedDealsCleared: number;
}

/** Exported standalone — same reasoning as every other job's run function this session. */
export async function runDealHealthRefresh(now: Date = new Date()): Promise<DealHealthRefreshResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();

    const [openOpportunities, activityRows, closedWithStaleScore] = await Promise.all([
      prisma.opportunity.findMany({
        where: { pipelineStage: { isWon: false, isLost: false } },
        select: { id: true, expectedCloseDate: true, createdAt: true },
      }),
      prisma.activity.findMany({
        where: { opportunityId: { not: null } },
        select: { opportunityId: true, occurredAt: true },
      }),
      // A deal that closed since its last scoring run should stop reading
      // as "on track"/"at risk" — clear rather than leave a stale number
      // frozen from before the close.
      prisma.opportunity.findMany({
        where: { pipelineStage: { OR: [{ isWon: true }, { isLost: true }] }, dealHealthScore: { not: null } },
        select: { id: true },
      }),
    ]);

    const lastTouchByOpportunity = new Map<string, Date>();
    for (const row of activityRows) {
      if (!row.opportunityId) continue;
      const prior = lastTouchByOpportunity.get(row.opportunityId);
      if (!prior || row.occurredAt > prior) lastTouchByOpportunity.set(row.opportunityId, row.occurredAt);
    }

    let opportunitiesScored = 0;
    for (const opp of openOpportunities) {
      const lastTouch = lastTouchByOpportunity.get(opp.id) ?? opp.createdAt;
      const dealHealthScore = Math.round((overdueScore(opp.expectedCloseDate, now) + engagementScore(lastTouch, now)) / 2);
      await prisma.opportunity.update({
        where: { id: opp.id },
        data: { dealHealthScore, dealHealthScoreComputedAt: now },
      });
      opportunitiesScored++;
    }

    for (const opp of closedWithStaleScore) {
      await prisma.opportunity.update({ where: { id: opp.id }, data: { dealHealthScore: null, dealHealthScoreComputedAt: now } });
    }

    return { opportunitiesScored, closedDealsCleared: closedWithStaleScore.length };
  });
}

export function createDealHealthRefreshQueue(connection: Redis): Queue {
  return new Queue(DEAL_HEALTH_REFRESH_QUEUE_NAME, { connection });
}

export function createDealHealthRefreshWorker(connection: Redis): Worker {
  return new Worker(
    DEAL_HEALTH_REFRESH_QUEUE_NAME,
    async (_job: Job) => {
      const result = await runDealHealthRefresh();
      console.log(`[deal-health-refresh] ${result.opportunitiesScored} opportunity(ies) scored, ${result.closedDealsCleared} closed deal(s) cleared`);
      return result;
    },
    { connection },
  );
}

/** Idempotent — see renewal-scan.job.ts's scheduleRenewalScan comment; same reasoning applies here. */
export async function scheduleDealHealthRefresh(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(DEAL_HEALTH_REFRESH_SCHEDULER_ID, { every: DEAL_HEALTH_REFRESH_INTERVAL_MS }, { name: 'refresh' });
}
