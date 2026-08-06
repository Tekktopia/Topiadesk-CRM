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
import {
  createNotificationEmailDispatchQueue,
  createNotificationEmailDispatchWorker,
  scheduleNotificationEmailDispatch,
} from './notification-dispatch/notification-email-dispatch.job';
import { createAutomationEventsQueue, createAutomationEventsWorker } from '../automation/automation-events.queue';
import { createAutomationRunResumeQueue, createAutomationRunResumeWorker } from '../automation/automation-run-resume.queue';
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
import { createCaseOutboundEmailQueue, createCaseOutboundEmailWorker } from './case-outbound-email/send-case-comment-email.job';
import { createPortalLoginQueue, createPortalLoginWorker } from './portal/send-portal-login-link.job';

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

  const notificationEmailDispatchQueue = createNotificationEmailDispatchQueue(connection);
  const notificationEmailDispatchWorker = createNotificationEmailDispatchWorker(connection);
  await scheduleNotificationEmailDispatch(notificationEmailDispatchQueue);

  // Event-driven, not a repeatable schedule — no upsertJobScheduler call:
  // case/claim mutations in the API enqueue onto this queue directly (see
  // backend/api/src/modules/case-management/automation-events.util.ts).
  const automationEventsQueue = createAutomationEventsQueue(connection);
  const automationEventsWorker = createAutomationEventsWorker(connection);

  // Event-driven, not a repeatable schedule — same reasoning as
  // automationEventsQueue: the API enqueues directly when a human decides
  // a WAITING_APPROVAL run's Approval (see case-management/
  // automation-run-resume.util.ts).
  const automationRunResumeQueue = createAutomationRunResumeQueue(connection);
  const automationRunResumeWorker = createAutomationRunResumeWorker(connection);

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

  // Event-driven, not a repeatable schedule — same reasoning as
  // surveyDispatchQueue above: the API enqueues directly when an OUTBOUND
  // comment posts on a Case (see case-management/comments.service.ts).
  const caseOutboundEmailQueue = createCaseOutboundEmailQueue(connection);
  const caseOutboundEmailWorker = createCaseOutboundEmailWorker(connection);

  // Event-driven, not a repeatable schedule — same reasoning as
  // surveyDispatchQueue above: the API enqueues directly when a portal
  // Contact requests a magic-link sign-in (see
  // portal/portal-login-queue.ts).
  const portalLoginQueue = createPortalLoginQueue(connection);
  const portalLoginWorker = createPortalLoginWorker(connection);

  return {
    queues: [
      renewalScanQueue,
      premiumAgingQueue,
      agentSurveySummaryQueue,
      scheduledReportGenerateQueue,
      scheduledReportDispatchQueue,
      slaBreachScanQueue,
      notificationEmailDispatchQueue,
      automationEventsQueue,
      campaignDispatchQueue,
      abTestResolveQueue,
      webhookDispatchQueue,
      webhookPollQueue,
      surveyDispatchQueue,
      caseOutboundEmailQueue,
      automationRunResumeQueue,
      portalLoginQueue,
    ],
    workers: [
      renewalScanWorker,
      premiumAgingWorker,
      agentSurveySummaryWorker,
      scheduledReportGenerateWorker,
      scheduledReportDispatchWorker,
      slaBreachScanWorker,
      notificationEmailDispatchWorker,
      automationEventsWorker,
      campaignDispatchWorker,
      abTestResolveWorker,
      webhookDispatchWorker,
      webhookPollWorker,
      surveyDispatchWorker,
      caseOutboundEmailWorker,
      automationRunResumeWorker,
      portalLoginWorker,
    ],
  };
}

export async function closeJobs(jobs: RegisteredJobs): Promise<void> {
  await Promise.all([...jobs.workers.map((w) => w.close()), ...jobs.queues.map((q) => q.close())]);
}
