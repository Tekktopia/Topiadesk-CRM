/**
 * Auto-decides A/B test winners for campaigns whose test sample has had
 * enough time to accumulate opens/clicks — a fixed 24h window after
 * Campaign.sentAt. dispatch.job.ts sets sentAt once the TEST-SAMPLE batch
 * (not the whole campaign) finishes sending for an A/B campaign — see that
 * file's drainRecipients for why — so this window measures "24h since the
 * sample went out", matching the build brief's "24h after sentAt for the
 * test-sample batch, configurable via a constant, not over-engineered".
 *
 * Duplicates the comparison logic in
 * backend/api/src/modules/campaigns/campaigns.controller.ts's
 * decideAbTestWinner endpoint — the worker can't call that authenticated
 * HTTP endpoint (no service-account JWT flow exists in this codebase for
 * worker->api calls; every worker job talks to Postgres directly instead),
 * same api/worker duplication reasoning as segment-filters.ts. Kept
 * deliberately simple: one fixed window constant, no per-campaign
 * configurability, no statistical-significance test beyond "did anything
 * actually send" — a real product would want the latter; flagged as a
 * reasonable later refinement, not built here.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { dispatchCampaign } from './dispatch.job';

export const AB_TEST_RESOLVE_QUEUE_NAME = 'campaign-ab-test-resolve';
const AB_TEST_RESOLVE_SCHEDULER_ID = 'campaign-ab-test-resolve-scheduler';
const AB_TEST_RESOLVE_POLL_INTERVAL_MS = 15 * 60 * 1000; // matches renewal-scan's ~15 min cadence
const AB_TEST_DECISION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h after the test sample finished sending

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;
}

export interface AbTestResolveResult {
  candidatesConsidered: number;
  decided: number;
}

/** Always runs under SYSTEM_JOB — same reasoning as runCampaignDispatchPoll in dispatch.job.ts. */
export async function runAbTestResolve(now: Date = new Date()): Promise<AbTestResolveResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const cutoff = new Date(now.getTime() - AB_TEST_DECISION_WINDOW_MS);
    const candidates = await prisma.campaign.findMany({
      where: { abTestEnabled: true, abTestDecidedAt: null, sentAt: { not: null, lte: cutoff } },
      include: { variants: true },
    });

    let decided = 0;
    for (const campaign of candidates) {
      if (!campaign.abTestMetric || campaign.variants.length === 0) continue;

      const grouped = await prisma.campaignRecipient.groupBy({
        by: ['variantId', 'status'],
        where: { campaignId: campaign.id, variantId: { not: null } },
        _count: true,
      });

      let winner: (typeof campaign.variants)[number] | undefined;
      let winnerRate = -1;
      let anySentData = false;
      for (const v of campaign.variants) {
        const rows = grouped.filter((g) => g.variantId === v.id);
        const c = (status: string) => rows.find((r) => r.status === status)?._count ?? 0;
        const vSent = c('SENT') + c('DELIVERED') + c('OPENED') + c('CLICKED') + c('BOUNCED');
        if (vSent > 0) anySentData = true;
        const vOpened = c('OPENED') + c('CLICKED');
        const vClicked = c('CLICKED');
        const vRate = campaign.abTestMetric === 'OPEN_RATE' ? rate(vOpened, vSent) : rate(vClicked, vSent);
        if (vRate > winnerRate) {
          winnerRate = vRate;
          winner = v;
        }
      }
      // No send data at all (e.g. every test-sample send failed) — nothing
      // to compare yet; leave it for a later tick rather than picking an
      // arbitrary "winner".
      if (!anySentData || !winner) continue;

      const abTestDecidedAt = now;
      await prisma.campaign.update({ where: { id: campaign.id }, data: { abTestWinnerVariantId: winner.id, abTestDecidedAt } });

      const heldBack = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id, variantId: null, status: 'PENDING' } });
      for (const r of heldBack) {
        await prisma.campaignRecipient.update({ where: { id: r.id }, data: { variantId: winner.id } });
      }
      // In-process, not a re-enqueued BullMQ job — this job is already
      // running in the worker, so it can drive the drain directly. See
      // dispatch.job.ts's header comment on why dispatchCampaign is
      // exported standalone for exactly this.
      await dispatchCampaign(campaign.id, now);
      decided++;
    }

    return { candidatesConsidered: candidates.length, decided };
  });
}

export function createAbTestResolveQueue(connection: Redis): Queue {
  return new Queue(AB_TEST_RESOLVE_QUEUE_NAME, { connection });
}

export function createAbTestResolveWorker(connection: Redis): Worker {
  return new Worker(
    AB_TEST_RESOLVE_QUEUE_NAME,
    async (_job: Job) => {
      const result = await runAbTestResolve();
      console.log(`[campaign-ab-test-resolve] ${result.candidatesConsidered} candidate(s) considered, ${result.decided} winner(s) decided`);
      return result;
    },
    { connection },
  );
}

/** Safe to call on every worker boot — upsertJobScheduler is idempotent by scheduler id, same as renewal-scan's scheduleRenewalScan. */
export async function scheduleAbTestResolve(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(AB_TEST_RESOLVE_SCHEDULER_ID, { every: AB_TEST_RESOLVE_POLL_INTERVAL_MS }, { name: 'resolve' });
}
