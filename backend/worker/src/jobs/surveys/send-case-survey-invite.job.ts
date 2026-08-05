/**
 * Consumer side of Survey.triggerEvent === 'CASE_RESOLVED' — see
 * backend/api/src/modules/case-management/survey-dispatch-queue.ts's header
 * comment for the producer side and the full architecture rationale. This
 * is the piece SurveysService.createSurveyResponse()'s own header comment
 * flagged as "not built yet" — a Case moving to RESOLVED now actually
 * results in a real emailed CSAT/NPS/CES invitation, not just a
 * configurable-but-inert dropdown.
 *
 * The actual SurveyResponse-row creation logic here deliberately mirrors
 * (rather than imports) SurveysService.createSurveyResponse() in
 * backend/api — api and worker are independently deployable apps with no
 * shared package for this (same boundary every other worker job in this
 * directory respects, e.g. campaigns' merge-fields.ts duplicates rather
 * than imports its api-side counterpart).
 */
import { randomBytes } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { sendMail } from '../scheduled-reports/mailer';

export const SURVEY_DISPATCH_QUEUE_NAME = 'survey-dispatch';

export interface SendCaseSurveyInviteJobData {
  surveyId: string;
  caseId: string;
}

/** Resolves the best-known email for whoever should receive this Case's survey: the Case's own linked Contact first, else the linked Account's primary Contact. Returns null (skip, no error) if neither exists — plenty of Cases (internal-only, or omnichannel-anonymous with no email on file) legitimately have no one to survey. */
async function resolveRespondentEmail(caseId: string): Promise<string | null> {
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

export async function sendCaseSurveyInvite(data: SendCaseSurveyInviteJobData): Promise<{ status: 'sent' | 'skipped-no-email' | 'skipped-duplicate' | 'skipped-not-resolved' }> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();

    const kase = await prisma.case.findUnique({ where: { id: data.caseId } });
    // The case may have been reopened between enqueue and this (possibly
    // delayed, per sendDelayMinutes) run — don't survey a case that's no
    // longer actually resolved.
    if (!kase || kase.status !== 'RESOLVED') return { status: 'skipped-not-resolved' };

    const survey = await prisma.survey.findUnique({ where: { id: data.surveyId } });
    if (!survey || !survey.isActive) return { status: 'skipped-not-resolved' };

    const dedupeKey = `${data.surveyId}:CASE:${data.caseId}`;
    const existing = await prisma.surveyResponse.findUnique({ where: { dedupeKey } });
    if (existing) return { status: 'skipped-duplicate' };

    const email = await resolveRespondentEmail(data.caseId);
    if (!email) return { status: 'skipped-no-email' };

    const account = kase.accountId ? await prisma.account.findUnique({ where: { id: kase.accountId } }) : null;
    const respondToken = randomBytes(32).toString('hex');
    const response = await prisma.surveyResponse.create({
      data: {
        surveyId: data.surveyId,
        triggerEntityType: 'CASE',
        triggerEntityId: data.caseId,
        accountId: kase.accountId,
        respondentContactId: kase.contactId,
        agentId: kase.assignedToId,
        channel: 'EMAIL',
        dedupeKey,
        respondToken,
        sentAt: new Date(),
      },
    });

    const env = loadEnv();
    const link = `${env.APP_URL}/survey-respond/${response.id}.${response.respondToken}`;
    await sendMail({
      to: email,
      subject: `${survey.name} — ${kase.subject}`,
      text: `${survey.questionText}\n\nShare your feedback: ${link}${account ? `\n\nRegarding: ${account.name} — case ${kase.caseNumber}` : `\n\nRegarding case ${kase.caseNumber}`}`,
    });

    return { status: 'sent' };
  });
}

export function createSurveyDispatchQueue(connection: Redis): Queue {
  return new Queue(SURVEY_DISPATCH_QUEUE_NAME, { connection });
}

export function createSurveyDispatchWorker(connection: Redis): Worker {
  return new Worker(
    SURVEY_DISPATCH_QUEUE_NAME,
    async (job: Job<SendCaseSurveyInviteJobData>) => {
      const result = await sendCaseSurveyInvite(job.data);
      console.log(`[survey-dispatch] survey ${job.data.surveyId} case ${job.data.caseId}: ${result.status}`);
      return result;
    },
    { connection },
  );
}
