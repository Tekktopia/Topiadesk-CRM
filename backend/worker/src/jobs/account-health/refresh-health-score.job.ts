/**
 * Recomputes `Account.healthScore` — a 0-100 relationship-health signal,
 * distinct from `Account.riskRating` (100% manual, underwriting risk, never
 * touched by this job). Composite of up to three independent sub-scores,
 * averaged over whichever have applicable data (an account with no
 * policies/premiums at all gets a null overall score, not a misleading
 * 100):
 *
 *  - Renewal: worst (minimum) RenewalSchedule.status across the account's
 *    policies, via RENEWAL_SEVERITY below. Skipped if the account has no
 *    renewal schedules.
 *  - Claims: 100 - min(100, openClaimCount * 25) — same OPEN_CLAIM_STATUSES
 *    definition as assignment-resolver.util.ts's countOpenLoad. Included
 *    whenever the account has at least one policy (zero open claims is a
 *    real, scoreable state) — but never on its own for a policy-less
 *    account, which would otherwise read as "100% healthy" purely for
 *    having nothing to score.
 *  - Payment: worst (minimum) aging bucket across the account's non-PAID
 *    Premium rows, using the exact same day boundaries as
 *    premium_aging_summary (prisma/rls/004_reporting_views.sql) so the two
 *    surfaces never disagree on what counts as "31-60 days overdue" — but
 *    computed inline via Prisma rather than querying that materialized
 *    view, since this job needs per-account worst-bucket, not the view's
 *    per-policy rows. Skipped if the account has no premiums at all.
 *
 * Three bulk findMany queries (not per-account N+1), grouped in JS by
 * accountId — same aggregation style as getSalesForecast/getRenewalForecast
 * (dashboards.controller.ts). Hourly cadence, same as premium-aging-refresh
 * (this signal doesn't need to be fresher than that).
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';

export const ACCOUNT_HEALTH_REFRESH_QUEUE_NAME = 'account-health-refresh';
const ACCOUNT_HEALTH_REFRESH_SCHEDULER_ID = 'account-health-refresh-scheduler';
const ACCOUNT_HEALTH_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

const RENEWAL_SEVERITY: Record<string, number> = {
  RENEWED: 100,
  ON_TRACK: 90,
  IN_PROGRESS: 75,
  AT_RISK: 40,
  DECLINED_TO_RENEW: 10,
  LAPSED: 0,
};

const OPEN_CLAIM_STATUSES = ['NOTIFIED', 'UNDER_REVIEW', 'ADJUSTED', 'REOPENED'] as const;

function agingBucketScore(dueDate: Date, now: Date): number {
  const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
  if (daysOverdue <= 0) return 100;
  if (daysOverdue <= 30) return 75;
  if (daysOverdue <= 60) return 50;
  if (daysOverdue <= 90) return 25;
  return 0;
}

export interface AccountHealthRefreshResult {
  accountsScored: number;
}

/** Exported standalone — same reasoning as every other job's run function this session: testable/manually-runnable, and an org-wide scan needs SYSTEM_JOB_CONTEXT for RLS. */
export async function runAccountHealthRefresh(now: Date = new Date()): Promise<AccountHealthRefreshResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();

    const [accounts, renewalRows, openClaimRows, unpaidPremiumRows] = await Promise.all([
      // _count.policies (not a second query — one aggregated join) decides
      // whether the always-applicable claims sub-score alone is enough to
      // produce a real score: a PROSPECT account with zero policies has no
      // relationship to speak of yet, so it should stay null, not read as
      // "100% healthy" purely because it has zero open claims.
      prisma.account.findMany({ select: { id: true, _count: { select: { policies: true } } } }),
      prisma.renewalSchedule.findMany({ select: { status: true, policy: { select: { accountId: true } } } }),
      prisma.claim.findMany({
        where: { status: { in: [...OPEN_CLAIM_STATUSES] } },
        select: { policy: { select: { accountId: true } } },
      }),
      prisma.premium.findMany({
        where: { status: { not: 'PAID' } },
        select: { dueDate: true, policy: { select: { accountId: true } } },
      }),
    ]);

    const renewalWorstByAccount = new Map<string, number>();
    for (const row of renewalRows) {
      const severity = RENEWAL_SEVERITY[row.status] ?? 50;
      const accountId = row.policy.accountId;
      const prior = renewalWorstByAccount.get(accountId);
      if (prior === undefined || severity < prior) renewalWorstByAccount.set(accountId, severity);
    }

    const openClaimCountByAccount = new Map<string, number>();
    for (const row of openClaimRows) {
      const accountId = row.policy.accountId;
      openClaimCountByAccount.set(accountId, (openClaimCountByAccount.get(accountId) ?? 0) + 1);
    }

    const paymentWorstByAccount = new Map<string, number>();
    for (const row of unpaidPremiumRows) {
      const score = agingBucketScore(row.dueDate, now);
      const accountId = row.policy.accountId;
      const prior = paymentWorstByAccount.get(accountId);
      if (prior === undefined || score < prior) paymentWorstByAccount.set(accountId, score);
    }

    let accountsScored = 0;
    for (const account of accounts) {
      const subScores: number[] = [];
      const renewalScore = renewalWorstByAccount.get(account.id);
      if (renewalScore !== undefined) subScores.push(renewalScore);

      // Always applicable — zero open claims is itself a scoreable state,
      // unlike renewal/payment which need at least one underlying row.
      const openClaimCount = openClaimCountByAccount.get(account.id) ?? 0;
      subScores.push(100 - Math.min(100, openClaimCount * 25));

      const paymentScore = paymentWorstByAccount.get(account.id);
      if (paymentScore !== undefined) subScores.push(paymentScore);

      const hasRealSignal = account._count.policies > 0;
      const healthScore = hasRealSignal ? Math.round(subScores.reduce((sum, s) => sum + s, 0) / subScores.length) : null;

      await prisma.account.update({
        where: { id: account.id },
        data: { healthScore, healthScoreComputedAt: now },
      });
      accountsScored++;
    }

    return { accountsScored };
  });
}

export function createAccountHealthRefreshQueue(connection: Redis): Queue {
  return new Queue(ACCOUNT_HEALTH_REFRESH_QUEUE_NAME, { connection });
}

export function createAccountHealthRefreshWorker(connection: Redis): Worker {
  return new Worker(
    ACCOUNT_HEALTH_REFRESH_QUEUE_NAME,
    async (_job: Job) => {
      const result = await runAccountHealthRefresh();
      console.log(`[account-health-refresh] ${result.accountsScored} account(s) scored`);
      return result;
    },
    { connection },
  );
}

/** Idempotent — see renewal-scan.job.ts's scheduleRenewalScan comment; same reasoning applies here. */
export async function scheduleAccountHealthRefresh(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(ACCOUNT_HEALTH_REFRESH_SCHEDULER_ID, { every: ACCOUNT_HEALTH_REFRESH_INTERVAL_MS }, { name: 'refresh' });
}
