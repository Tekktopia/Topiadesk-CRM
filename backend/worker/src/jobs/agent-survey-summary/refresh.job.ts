/**
 * Refreshes `agent_survey_summary` (see prisma/rls/004_reporting_views.sql
 * — same materialized-view + SECURITY DEFINER refresh + scoped-wrapper
 * pattern as premium_aging_summary, refreshed by the worker on the same
 * cron mechanism). Its own queue/schedule, mirroring
 * premium-aging/refresh-aging.job.ts's reasoning: CSAT/NPS rollups can
 * tolerate the same nightly-ish staleness aging buckets can, and keeping
 * it on its own schedule keeps one job's failure mode from blocking the
 * other's.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { executeRawWithRlsContext } from '../../rls-raw-query.util';

export const AGENT_SURVEY_SUMMARY_REFRESH_QUEUE_NAME = 'agent-survey-summary-refresh';
const AGENT_SURVEY_SUMMARY_REFRESH_SCHEDULER_ID = 'agent-survey-summary-refresh-scheduler';
const AGENT_SURVEY_SUMMARY_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export async function runAgentSurveySummaryRefresh(): Promise<void> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => executeRawWithRlsContext('SELECT refresh_agent_survey_summary()'));
}

export function createAgentSurveySummaryRefreshQueue(connection: Redis): Queue {
  return new Queue(AGENT_SURVEY_SUMMARY_REFRESH_QUEUE_NAME, { connection });
}

export function createAgentSurveySummaryRefreshWorker(connection: Redis): Worker {
  return new Worker(
    AGENT_SURVEY_SUMMARY_REFRESH_QUEUE_NAME,
    async (_job: Job) => {
      await runAgentSurveySummaryRefresh();
      console.log('[agent-survey-summary-refresh] agent_survey_summary refreshed');
    },
    { connection },
  );
}

/** Idempotent — see renewal-scan.job.ts's scheduleRenewalScan comment; same reasoning applies here. */
export async function scheduleAgentSurveySummaryRefresh(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(AGENT_SURVEY_SUMMARY_REFRESH_SCHEDULER_ID, { every: AGENT_SURVEY_SUMMARY_REFRESH_INTERVAL_MS }, { name: 'refresh' });
}
