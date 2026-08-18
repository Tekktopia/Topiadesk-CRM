import type Redis from 'ioredis';
import type { Queue, Worker } from 'bullmq';
import { createRenewalScanQueue, createRenewalScanWorker, scheduleRenewalScan } from './renewal-alerts/renewal-scan.job';
import { createRenewalAtRiskScanQueue, createRenewalAtRiskScanWorker, scheduleRenewalAtRiskScan } from './renewal-at-risk/at-risk-scan.job';
import { createPremiumAgingRefreshQueue, createPremiumAgingRefreshWorker, schedulePremiumAgingRefresh } from './premium-aging/refresh-aging.job';
import { createAccountHealthRefreshQueue, createAccountHealthRefreshWorker, scheduleAccountHealthRefresh } from './account-health/refresh-health-score.job';
import { createDealHealthRefreshQueue, createDealHealthRefreshWorker, scheduleDealHealthRefresh } from './deal-health/refresh-deal-health.job';
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
import { createAutomationAsyncActionQueue, createAutomationAsyncActionWorker } from '../automation/async-action.queue';
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
import { createBulkInviteEmailQueue, createBulkInviteEmailWorker } from './identity/send-bulk-invite-email.job';
import { createProvisionTenantQueue, createProvisionTenantWorker } from './platform/provision-tenant.job';
import { createCreatePlatformAdminQueue, createCreatePlatformAdminWorker } from './platform/create-platform-admin.job';
import { createCreateTenantAdminQueue, createCreateTenantAdminWorker } from './platform/create-tenant-admin.job';
import { createCreateSupportTicketQueue, createCreateSupportTicketWorker } from './platform/create-support-ticket.job';
import { createNotifyTeamAssignmentQueue, createNotifyTeamAssignmentWorker } from './case-management/notify-team-assignment.job';
import { createNotifyCaseAssignmentQueue, createNotifyCaseAssignmentWorker } from './case-management/notify-case-assignment.job';
import { createGraphSyncQueue, createGraphSyncWorker, scheduleGraphSync } from './graph-sync/graph-sync.job';
import {
  createAutomationScheduleQueue,
  createAutomationScheduleWorker,
  scheduleAutomationScan,
} from './automation-schedule/schedule-scan.job';
import { createAuditCheckpointQueue, createAuditCheckpointWorker, scheduleAuditCheckpoint } from './audit-checkpoint/create-checkpoint.job';
import { createDetectAnomaliesQueue, createDetectAnomaliesWorker, scheduleDetectAnomalies } from './security-monitoring/detect-anomalies.job';

export interface RegisteredJobs {
  queues: Queue[];
  workers: Worker[];
}

/** Wires up both repeatable jobs and starts their processors — called once from main.ts at boot. */
export async function registerJobs(connection: Redis): Promise<RegisteredJobs> {
  const renewalScanQueue = createRenewalScanQueue(connection);
  const renewalScanWorker = createRenewalScanWorker(connection);
  await scheduleRenewalScan(renewalScanQueue);

  const renewalAtRiskScanQueue = createRenewalAtRiskScanQueue(connection);
  const renewalAtRiskScanWorker = createRenewalAtRiskScanWorker(connection);
  await scheduleRenewalAtRiskScan(renewalAtRiskScanQueue);

  const premiumAgingQueue = createPremiumAgingRefreshQueue(connection);
  const premiumAgingWorker = createPremiumAgingRefreshWorker(connection);
  await schedulePremiumAgingRefresh(premiumAgingQueue);

  const accountHealthQueue = createAccountHealthRefreshQueue(connection);
  const accountHealthWorker = createAccountHealthRefreshWorker(connection);
  await scheduleAccountHealthRefresh(accountHealthQueue);

  const dealHealthQueue = createDealHealthRefreshQueue(connection);
  const dealHealthWorker = createDealHealthRefreshWorker(connection);
  await scheduleDealHealthRefresh(dealHealthQueue);

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

  // Event-driven, not a repeatable schedule — the API enqueues directly
  // when a tenant admin's bulk-invite CSV row successfully creates a
  // Keycloak user + local row (see backend/api/src/modules/identity/
  // users.controller.ts's bulkInvite()).
  const bulkInviteEmailQueue = createBulkInviteEmailQueue(connection);
  const bulkInviteEmailWorker = createBulkInviteEmailWorker(connection);

  // Event-driven, not a repeatable schedule — the Platform-Admin API
  // enqueues directly when a Global Admin operator creates a new tenant
  // (see backend/api/src/modules/platform/tenants.controller.ts).
  const provisionTenantQueue = createProvisionTenantQueue(connection);
  const provisionTenantWorker = createProvisionTenantWorker(connection);

  // Event-driven, not a repeatable schedule — same reasoning as
  // provisionTenantQueue above: the Platform-Admin API enqueues directly
  // when a Global Admin operator creates a new PlatformAdminUser (see
  // backend/api/src/modules/platform/create-platform-admin-queue.ts).
  const createPlatformAdminQueue = createCreatePlatformAdminQueue(connection);
  const createPlatformAdminWorker = createCreatePlatformAdminWorker(connection);

  // Event-driven, not a repeatable schedule — same reasoning as
  // createPlatformAdminQueue above: the Platform-Admin API enqueues
  // directly when a Global Admin operator creates an additional admin for
  // an existing tenant (see backend/api/src/modules/platform/
  // tenant-users.controller.ts).
  const createTenantAdminQueue = createCreateTenantAdminQueue(connection);
  const createTenantAdminWorker = createCreateTenantAdminWorker(connection);

  // Event-driven, not a repeatable schedule — the API enqueues directly
  // when a tenant user submits a support ticket (see backend/api/src/
  // modules/support/create-support-ticket-queue.ts).
  const createSupportTicketQueue = createCreateSupportTicketQueue(connection);
  const createSupportTicketWorker = createCreateSupportTicketWorker(connection);

  // Event-driven, not a repeatable schedule — the API enqueues directly
  // when a case is created with, or updated to have, a real
  // assignedTeamId (see backend/api/src/modules/case-management/
  // cases.controller.ts).
  const notifyTeamAssignmentQueue = createNotifyTeamAssignmentQueue(connection);
  const notifyTeamAssignmentWorker = createNotifyTeamAssignmentWorker(connection);

  // Individual-assignee counterpart: assigning a ticket to a named person
  // notified nobody before this, so the assignee only found out by
  // stumbling across it in a list.
  const notifyCaseAssignmentQueue = createNotifyCaseAssignmentQueue(connection);
  const notifyCaseAssignmentWorker = createNotifyCaseAssignmentWorker(connection);

  // Microsoft 365 delta sync — a periodic sweep across every connected
  // mailbox, per tenant schema. See the job's own header for why this is a
  // sweep rather than one job per connection.
  const graphSyncQueue = createGraphSyncQueue(connection);
  const graphSyncWorker = createGraphSyncWorker(connection);
  await scheduleGraphSync(graphSyncQueue);

  // Consumes AutomationRule rows with triggerType SCHEDULE. Until this
  // existed those rules were stored and never executed — see
  // automation-schedule/schedule-scan.job.ts.
  // Runs the three outward-facing actions a macro cannot perform inline
  // without hanging the user's request — see async-action.queue.ts.
  const automationAsyncActionQueue = createAutomationAsyncActionQueue(connection);
  const automationAsyncActionWorker = createAutomationAsyncActionWorker(connection);

  const automationScheduleQueue = createAutomationScheduleQueue(connection);
  const automationScheduleWorker = createAutomationScheduleWorker(connection);
  await scheduleAutomationScan(automationScheduleQueue);

  const auditCheckpointQueue = createAuditCheckpointQueue(connection);
  const auditCheckpointWorker = createAuditCheckpointWorker(connection);
  await scheduleAuditCheckpoint(auditCheckpointQueue);

  const detectAnomaliesQueue = createDetectAnomaliesQueue(connection);
  const detectAnomaliesWorker = createDetectAnomaliesWorker(connection);
  await scheduleDetectAnomalies(detectAnomaliesQueue);

  return {
    queues: [
      renewalScanQueue,
      renewalAtRiskScanQueue,
      premiumAgingQueue,
      accountHealthQueue,
      dealHealthQueue,
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
      bulkInviteEmailQueue,
      provisionTenantQueue,
      createPlatformAdminQueue,
      createTenantAdminQueue,
      createSupportTicketQueue,
      notifyTeamAssignmentQueue,
      notifyCaseAssignmentQueue,
      graphSyncQueue,
      automationScheduleQueue,
      automationAsyncActionQueue,
      auditCheckpointQueue,
      detectAnomaliesQueue,
    ],
    workers: [
      renewalScanWorker,
      renewalAtRiskScanWorker,
      premiumAgingWorker,
      accountHealthWorker,
      dealHealthWorker,
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
      bulkInviteEmailWorker,
      provisionTenantWorker,
      createPlatformAdminWorker,
      createTenantAdminWorker,
      createSupportTicketWorker,
      notifyTeamAssignmentWorker,
      notifyCaseAssignmentWorker,
      graphSyncWorker,
      automationScheduleWorker,
      automationAsyncActionWorker,
      auditCheckpointWorker,
      detectAnomaliesWorker,
    ],
  };
}

export async function closeJobs(jobs: RegisteredJobs): Promise<void> {
  await Promise.all([...jobs.workers.map((w) => w.close()), ...jobs.queues.map((q) => q.close())]);
}
