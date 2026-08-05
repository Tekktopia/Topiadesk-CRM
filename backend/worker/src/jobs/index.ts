import type Redis from 'ioredis';
import type { Queue, Worker } from 'bullmq';
import { createRenewalScanQueue, createRenewalScanWorker, scheduleRenewalScan } from './renewal-alerts/renewal-scan.job';
import { createPremiumAgingRefreshQueue, createPremiumAgingRefreshWorker, schedulePremiumAgingRefresh } from './premium-aging/refresh-aging.job';
import {
  createAgentSurveySummaryRefreshQueue,
  createAgentSurveySummaryRefreshWorker,
  scheduleAgentSurveySummaryRefresh,
} from './agent-survey-summary/refresh.job';
import { createScheduledReportDispatchQueue, createScheduledReportDispatchWorker, scheduleScheduledReportDispatch } from './scheduled-reports/dispatch.job';
import { createScheduledReportGenerateQueue, createScheduledReportGenerateWorker } from './scheduled-reports/generate-and-deliver.job';
import { createSlaBreachScanQueue, createSlaBreachScanWorker, scheduleSlaBreachScan } from './sla-breach-scan/breach-scan.job';
import { createAutomationEventsQueue, createAutomationEventsWorker } from '../automation/automation-events.queue';
import { createCampaignDispatchQueue, createCampaignDispatchWorker, scheduleCampaignDispatchPoll } from './campaigns/dispatch.job';
import { createAbTestResolveQueue, createAbTestResolveWorker, scheduleAbTestResolve } from './campaigns/ab-test-resolve.job';
import {
  createWebhookDispatchQueue,
  createWebhookDispatchWorker,
  createWebhookPollQueue,
  createWebhookPollWorker,
  scheduleWebhookPoll,
} from './webhooks/dispatch.job';
import { createSurveyDispatchQueue, createSurveyDispatchWorker } from './surveys/send-case-survey-invite.job';

export interface RegisteredJobs {
  queues: Queue[];
  workers: Worker[];
}

/** Wires up both repeatable jobs and starts their processors — called once from main.ts at boot. */
export async function registerJobs(connection: Redis): Promise<RegisteredJobs> {
  const renewalScanQueue = createRenewalScanQueue(connection);
  const renewalScanWorker = createRenewalScanWorker(connection);
  await scheduleRenewalScan(renewalScanQueue);

  const premiumAgingQueue = createPremiumAgingRefreshQueue(connection);
  const premiumAgingWorker = createPremiumAgingRefreshWorker(connection);
  await schedulePremiumAgingRefresh(premiumAgingQueue);

  const agentSurveySummaryQueue = createAgentSurveySummaryRefreshQueue(connection);
  const agentSurveySummaryWorker = createAgentSurveySummaryRefreshWorker(connection);
  await scheduleAgentSurveySummaryRefresh(agentSurveySummaryQueue);

  // Two-stage pipeline (see dispatch.job.ts's header comment): the
  // generate queue/worker must exist before the dispatch worker, since
  // dispatch enqueues onto it for every due ScheduledReport it finds.
  const scheduledReportGenerateQueue = createScheduledReportGenerateQueue(connection);
  const scheduledReportGenerateWorker = createScheduledReportGenerateWorker(connection);
  const scheduledReportDispatchQueue = createScheduledReportDispatchQueue(connection);
  const scheduledReportDispatchWorker = createScheduledReportDispatchWorker(connection, scheduledReportGenerateQueue);
  await scheduleScheduledReportDispatch(scheduledReportDispatchQueue);

  const slaBreachScanQueue = createSlaBreachScanQueue(connection);
  const slaBreachScanWorker = createSlaBreachScanWorker(connection);
  await scheduleSlaBreachScan(slaBreachScanQueue);

  // Event-driven, not a repeatable schedule — no upsertJobScheduler call:
  // case/claim mutations in the API enqueue onto this queue directly (see
  // backend/api/src/modules/case-management/automation-events.util.ts).
  const automationEventsQueue = createAutomationEventsQueue(connection);
  const automationEventsWorker = createAutomationEventsWorker(connection);

  // campaign-dispatch must exist before ab-test-resolve is scheduled:
  // runAbTestResolve calls dispatchCampaign in-process (not via the queue,
  // see ab-test-resolve.job.ts's header comment), but the campaign-dispatch
  // Worker still needs to be up to handle api-enqueued "send now"/"resume"
  // jobs on the same queue.
  const campaignDispatchQueue = createCampaignDispatchQueue(connection);
  const campaignDispatchWorker = createCampaignDispatchWorker(connection);
  await scheduleCampaignDispatchPoll(campaignDispatchQueue);

  const abTestResolveQueue = createAbTestResolveQueue(connection);
  const abTestResolveWorker = createAbTestResolveWorker(connection);
  await scheduleAbTestResolve(abTestResolveQueue);

  // Dispatch queue created BEFORE the poll worker — the poll worker's
  // processor enqueues INTO the dispatch queue on every tick (see
  // webhooks/dispatch.job.ts's createWebhookPollWorker()), same
  // two-stage-pipeline ordering requirement as scheduled-reports above.
  const webhookDispatchQueue = createWebhookDispatchQueue(connection);
  const webhookDispatchWorker = createWebhookDispatchWorker(connection);
  const webhookPollQueue = createWebhookPollQueue(connection);
  const webhookPollWorker = createWebhookPollWorker(connection, webhookDispatchQueue);
  await scheduleWebhookPoll(webhookPollQueue);

  // Event-driven, not a repeatable schedule — same reasoning as
  // automationEventsQueue above: the API enqueues directly when a Case is
  // marked RESOLVED (see status-transition.util.ts), no scan/poll needed.
  const surveyDispatchQueue = createSurveyDispatchQueue(connection);
  const surveyDispatchWorker = createSurveyDispatchWorker(connection);

  return {
    queues: [
      renewalScanQueue,
      premiumAgingQueue,
      agentSurveySummaryQueue,
      scheduledReportGenerateQueue,
      scheduledReportDispatchQueue,
      slaBreachScanQueue,
      automationEventsQueue,
      campaignDispatchQueue,
      abTestResolveQueue,
      webhookDispatchQueue,
      webhookPollQueue,
      surveyDispatchQueue,
    ],
    workers: [
      renewalScanWorker,
      premiumAgingWorker,
      agentSurveySummaryWorker,
      scheduledReportGenerateWorker,
      scheduledReportDispatchWorker,
      slaBreachScanWorker,
      automationEventsWorker,
      campaignDispatchWorker,
      abTestResolveWorker,
      webhookDispatchWorker,
      webhookPollWorker,
      surveyDispatchWorker,
    ],
  };
}

export async function closeJobs(jobs: RegisteredJobs): Promise<void> {
  await Promise.all([...jobs.workers.map((w) => w.close()), ...jobs.queues.map((q) => q.close())]);
}
