/**
 * Consumer side of Survey dispatch for every real trigger event — see
 * backend/api/src/modules/case-management/survey-dispatch-queue.ts's header
 * comment for the producer side and the full architecture rationale. This
 * is the piece SurveysService.createSurveyResponse()'s own header comment
 * flagged as "not built yet" — CASE_RESOLVED was wired up first (a Case
 * moving to RESOLVED now actually results in a real emailed CSAT/NPS/CES
 * invitation, not just a configurable-but-inert dropdown); CLAIM_SETTLED
 * and POLICY_ISSUED/POLICY_RENEWED were confirmed dead the same way
 * (selectable in the admin UI, zero dispatch logic anywhere) and are wired
 * up the same way here.
 *
 * The actual SurveyResponse-row creation logic here deliberately mirrors
 * (rather than imports) SurveysService.createSurveyResponse() in
 * backend/api — api and worker are independently deployable apps with no
 * shared package for this (same boundary every other worker job in this
 * directory respects, e.g. campaigns' merge-fields.ts duplicates rather
 * than imports its api-side counterpart).
 *
 * One BullMQ Worker, one queue, three job names — each with its own
 * resolve/send function below, routed by `job.name` in the processor at
 * the bottom of this file. Kept as one file/Worker (not three) since
 * they're small and share the exact same "resolve respondent email, check
 * for a dedupe collision, create SurveyResponse, send the mail" shape.
 */
import { randomBytes } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { sendMail } from '../scheduled-reports/mailer';
import { tenantBaseUrl } from '../tenant-url.util';

export const SURVEY_DISPATCH_QUEUE_NAME = 'survey-dispatch';

/**
 * Every payload here carries its tenant. The job reads survey/case/contact
 * rows and builds a client-facing link — both of which are wrong without it:
 * the lookups would run against `public` and find nothing, and the link would
 * point at the app host, which returns 403 for every real tenant.
 */
interface TenantScoped {
  tenantSchema?: string | null;
}

export interface SendCaseSurveyInviteJobData extends TenantScoped {
  surveyId: string;
  caseId: string;
}
export interface SendClaimSurveyInviteJobData extends TenantScoped {
  surveyId: string;
  claimId: string;
}
export interface SendPolicySurveyInviteJobData extends TenantScoped {
  surveyId: string;
  policyVersionId: string;
  triggerEvent: 'POLICY_ISSUED' | 'POLICY_RENEWED';
}

type SendResult = { status: 'sent' | 'skipped-no-email' | 'skipped-duplicate' | 'skipped-not-applicable' };

async function createResponseAndSend(params: {
  surveyId: string;
  triggerEntityType: string;
  triggerEntityId: string;
  dedupeKey: string;
  accountId: string | null;
  respondentContactId: string | null;
  agentId: string | null;
  email: string | null;
  subject: string;
  bodyIntro: string;
  /** Needed to build a link on the tenant's own origin. */
  tenantSchema: string | null;
}): Promise<SendResult> {
  const prisma = getPrismaClient();
  const survey = await prisma.survey.findUnique({ where: { id: params.surveyId } });
  if (!survey || !survey.isActive) return { status: 'skipped-not-applicable' };

  const existing = await prisma.surveyResponse.findUnique({ where: { dedupeKey: params.dedupeKey } });
  if (existing) return { status: 'skipped-duplicate' };

  if (!params.email) return { status: 'skipped-no-email' };

  const respondToken = randomBytes(32).toString('hex');
  const response = await prisma.surveyResponse.create({
    data: {
      surveyId: params.surveyId,
      triggerEntityType: params.triggerEntityType,
      triggerEntityId: params.triggerEntityId,
      accountId: params.accountId,
      respondentContactId: params.respondentContactId,
      agentId: params.agentId,
      channel: 'EMAIL',
      dedupeKey: params.dedupeKey,
      respondToken,
      sentAt: new Date(),
    },
  });

  // The tenant's own origin, never APP_URL — a survey invite goes to a
  // CLIENT, and the app host returns 403 for every real tenant.
  const link = `${await tenantBaseUrl(params.tenantSchema)}/survey-respond/${response.id}.${response.respondToken}`;
  await sendMail({
    to: params.email,
    subject: params.subject,
    text: `${survey.questionText}\n\nShare your feedback: ${link}\n\n${params.bodyIntro}`,
  });

  return { status: 'sent' };
}

/** Resolves the best-known email for whoever should receive this Case's survey: the Case's own linked Contact first, else the linked Account's primary Contact. Returns null (skip, no error) if neither exists — plenty of Cases (internal-only, or omnichannel-anonymous with no email on file) legitimately have no one to survey. */
async function resolveCaseRespondentEmail(caseId: string): Promise<string | null> {
  const prisma = getPrismaClient();
  const kase = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      contact: true,
      account: { include: { contacts: { where: { isPrimary: true }, take: 1 } } },
    },
  });
  if (!kase) return null;
  return kase.contact?.email ?? kase.account?.contacts[0]?.email ?? null;
}

export async function sendCaseSurveyInvite(data: SendCaseSurveyInviteJobData): Promise<SendResult> {
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: data.tenantSchema ?? null }, async () => {
    const prisma = getPrismaClient();
    const kase = await prisma.case.findUnique({ where: { id: data.caseId } });
    // The case may have been reopened between enqueue and this (possibly
    // delayed, per sendDelayMinutes) run — don't survey a case that's no
    // longer actually resolved.
    if (!kase || kase.status !== 'RESOLVED') return { status: 'skipped-not-applicable' };

    const account = kase.accountId ? await prisma.account.findUnique({ where: { id: kase.accountId } }) : null;
    return createResponseAndSend({
      surveyId: data.surveyId,
      tenantSchema: data.tenantSchema ?? null,
      triggerEntityType: 'CASE',
      triggerEntityId: data.caseId,
      dedupeKey: `${data.surveyId}:CASE:${data.caseId}`,
      accountId: kase.accountId,
      respondentContactId: kase.contactId,
      agentId: kase.assignedToId,
      email: await resolveCaseRespondentEmail(data.caseId),
      subject: `Survey — ${kase.subject}`,
      bodyIntro: account ? `Regarding: ${account.name} — case ${kase.caseNumber}` : `Regarding case ${kase.caseNumber}`,
    });
  });
}

/** Claims have no direct Contact FK (unlike Case) — respondent is always resolved via the Claim's Policy's Account's primary Contact. */
export async function sendClaimSurveyInvite(data: SendClaimSurveyInviteJobData): Promise<SendResult> {
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: data.tenantSchema ?? null }, async () => {
    const prisma = getPrismaClient();
    const claim = await prisma.claim.findUnique({
      where: { id: data.claimId },
      include: { policy: { include: { account: { include: { contacts: { where: { isPrimary: true }, take: 1 } } } } } },
    });
    // The claim may have moved on (e.g. reopened) between enqueue and this
    // (possibly delayed) run — don't survey a claim that's no longer
    // actually settled.
    if (!claim || claim.status !== 'SETTLED') return { status: 'skipped-not-applicable' };

    const primaryContact = claim.policy.account.contacts[0] ?? null;
    return createResponseAndSend({
      surveyId: data.surveyId,
      tenantSchema: data.tenantSchema ?? null,
      triggerEntityType: 'CLAIM',
      triggerEntityId: data.claimId,
      dedupeKey: `${data.surveyId}:CLAIM:${data.claimId}`,
      accountId: claim.policy.accountId,
      respondentContactId: primaryContact?.id ?? null,
      agentId: claim.adjusterId,
      email: primaryContact?.email ?? null,
      subject: `Survey — claim ${claim.claimNumber}`,
      bodyIntro: `Regarding: ${claim.policy.account.name} — claim ${claim.claimNumber}`,
    });
  });
}

/** Policies have no direct Contact FK either — respondent is the Policy's Account's primary Contact, same shape as Claim. */
export async function sendPolicySurveyInvite(data: SendPolicySurveyInviteJobData): Promise<SendResult> {
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: data.tenantSchema ?? null }, async () => {
    const prisma = getPrismaClient();
    const version = await prisma.policyVersion.findUnique({
      where: { id: data.policyVersionId },
      include: { policy: { include: { account: { include: { contacts: { where: { isPrimary: true }, take: 1 } } }, brokerOfRecord: true } } },
    });
    // Only survey once this version is actually the policy's current one —
    // an approval-gated version type can't reach here (ISSUANCE/RENEWAL
    // apply immediately, see policy-lifecycle.ts), but a later version
    // superseding this one before the (possibly delayed) job runs means
    // this specific version-event is stale.
    if (!version || version.policy.currentVersionId !== version.id) return { status: 'skipped-not-applicable' };

    const primaryContact = version.policy.account.contacts[0] ?? null;
    const eventLabel = data.triggerEvent === 'POLICY_ISSUED' ? 'issued' : 'renewed';
    return createResponseAndSend({
      surveyId: data.surveyId,
      tenantSchema: data.tenantSchema ?? null,
      triggerEntityType: 'POLICY_VERSION',
      triggerEntityId: data.policyVersionId,
      dedupeKey: `${data.surveyId}:POLICY_VERSION:${data.policyVersionId}`,
      accountId: version.policy.accountId,
      respondentContactId: primaryContact?.id ?? null,
      agentId: version.policy.brokerOfRecordId,
      email: primaryContact?.email ?? null,
      subject: `Survey — policy ${version.policy.policyNumber} ${eventLabel}`,
      bodyIntro: `Regarding: ${version.policy.account.name} — policy ${version.policy.policyNumber}`,
    });
  });
}

export function createSurveyDispatchQueue(connection: Redis): Queue {
  return new Queue(SURVEY_DISPATCH_QUEUE_NAME, { connection });
}

export function createSurveyDispatchWorker(connection: Redis): Worker {
  return new Worker(
    SURVEY_DISPATCH_QUEUE_NAME,
    async (job: Job<SendCaseSurveyInviteJobData | SendClaimSurveyInviteJobData | SendPolicySurveyInviteJobData>) => {
      let result: SendResult;
      switch (job.name) {
        case 'send-claim-survey-invite':
          result = await sendClaimSurveyInvite(job.data as SendClaimSurveyInviteJobData);
          break;
        case 'send-policy-survey-invite':
          result = await sendPolicySurveyInvite(job.data as SendPolicySurveyInviteJobData);
          break;
        case 'send-case-survey-invite':
        default:
          result = await sendCaseSurveyInvite(job.data as SendCaseSurveyInviteJobData);
          break;
      }
      console.log(`[survey-dispatch] ${job.name} ${job.id}: ${result.status}`);
      return result;
    },
    { connection },
  );
}
