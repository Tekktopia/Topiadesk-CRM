import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';

/**
 * Producer side of Survey dispatch for every real trigger event —
 * CASE_RESOLVED, CLAIM_SETTLED, POLICY_ISSUED, POLICY_RENEWED (MANUAL has
 * no producer; it's a human action elsewhere, not an entity-event hook).
 * CASE_RESOLVED was the only one wired up originally — the exact
 * integration SurveysService.createSurveyResponse()'s own header comment
 * names as "the obvious first caller" and flags the rest as not built yet;
 * CLAIM_SETTLED/POLICY_ISSUED/POLICY_RENEWED were the rest of that sentence,
 * confirmed dead (selectable in the admin Survey form, silently never
 * fired) via a full-repo grep before this file changed.
 *
 * Entity/status transitions call the matching `enqueueSurveyInvitesFor*`
 * below after their DB write commits (status-transition.util.ts for
 * CASE_RESOLVED/CLAIM_SETTLED, policy-version.controller.ts for
 * POLICY_ISSUED/POLICY_RENEWED); the worker's `survey-dispatch` BullMQ
 * Worker (backend/worker/src/jobs/surveys/send-case-survey-invite.job.ts)
 * consumes it, creates the SurveyResponse row, and emails the respond
 * link. Same producer/consumer split as automation-events.util.ts — see
 * that file's header comment for why this lives in api rather than a
 * shared package (worker already depends on bullmq/ioredis for its own
 * jobs; this is api's side of that same pattern).
 *
 * Per-survey delay: rather than one job that looks up matching surveys and
 * fans out (which would need a second queue stage to honor each survey's
 * own `sendDelayMinutes`), this enqueues one job per matching active
 * survey directly, each with its own BullMQ `delay` set from that survey's
 * `sendDelayMinutes` — the API layer already has the survey rows loaded,
 * so there's no reason to defer that lookup to the worker.
 *
 * A policy can issue and then renew multiple times over its life, each a
 * genuinely new "should we ask the customer" moment — dedupe keys off the
 * PolicyVersion id, not the Policy id, so a second renewal isn't silently
 * treated as a duplicate of the first. Claims/Cases dedupe off their own
 * id (matching the original CASE_RESOLVED behavior as-is): a
 * reopened-then-resettled claim not getting a second survey is an
 * accepted, pre-existing limitation, not a new asymmetry introduced here.
 */
const SURVEY_DISPATCH_QUEUE_NAME = 'survey-dispatch';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(SURVEY_DISPATCH_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface SendCaseSurveyInviteJobData {
  surveyId: string;
  caseId: string;
}
export interface SendClaimSurveyInviteJobData {
  surveyId: string;
  claimId: string;
}
export interface SendPolicySurveyInviteJobData {
  surveyId: string;
  policyVersionId: string;
  triggerEvent: 'POLICY_ISSUED' | 'POLICY_RENEWED';
}

type SurveyDispatchTriggerEvent = 'CASE_RESOLVED' | 'CLAIM_SETTLED' | 'POLICY_ISSUED' | 'POLICY_RENEWED';

/**
 * Fire-and-forget, same reasoning as enqueueEntityEvent: survey dispatch is
 * additive to a write that already committed — a Redis hiccup here must
 * never fail that request. jobId uses underscores, not colons (see
 * enqueueEntityEvent's header comment in automation-events.util.ts for why
 * a colon-separated id is unsafe with BullMQ), so a retried/duplicate call
 * for the same trigger can't double-enqueue (BullMQ treats a duplicate
 * jobId as a no-op add); the worker's own dedupeKey-guarded SurveyResponse
 * create is the second, DB-level idempotency layer for the same reason
 * renewal alerts have both.
 *
 * The Survey lookup runs under SYSTEM_JOB_CONTEXT deliberately, not
 * whatever RLS context the calling request happens to be bound to — this
 * is a system decision ("does this event need to notify a survey"), not
 * something that should depend on the acting user's own permission scope.
 * `surveys_rw` gates reads to `survey:read @ ALL scope`, which most
 * interactive roles don't hold — without this wrap, `findMany` would
 * silently return zero rows for that caller and this would look like "no
 * surveys configured" even when several genuinely active surveys exist.
 */
async function enqueueForTrigger<T extends object>(
  triggerEvent: SurveyDispatchTriggerEvent,
  jobName: string,
  dedupeSuffix: string,
  buildData: (surveyId: string) => T,
): Promise<void> {
  try {
    const surveys = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().survey.findMany({ where: { triggerEvent, isActive: true } }),
    );
    if (surveys.length === 0) return;

    const q = getQueue();
    await Promise.all(
      surveys.map((survey) =>
        q.add(jobName, buildData(survey.id), {
          jobId: `survey_${survey.id}_${dedupeSuffix}`,
          delay: Math.max(0, survey.sendDelayMinutes) * 60_000,
          removeOnComplete: true,
          removeOnFail: 100,
        }),
      ),
    );
  } catch (err) {
    console.error(`[case-management] failed to enqueue survey invites for ${triggerEvent}`, err);
  }
}

export async function enqueueSurveyInvitesForResolvedCase(caseId: string): Promise<void> {
  await enqueueForTrigger('CASE_RESOLVED', 'send-case-survey-invite', `case_${caseId}`, (surveyId): SendCaseSurveyInviteJobData => ({
    surveyId,
    caseId,
  }));
}

export async function enqueueSurveyInvitesForSettledClaim(claimId: string): Promise<void> {
  await enqueueForTrigger('CLAIM_SETTLED', 'send-claim-survey-invite', `claim_${claimId}`, (surveyId): SendClaimSurveyInviteJobData => ({
    surveyId,
    claimId,
  }));
}

export async function enqueueSurveyInvitesForPolicyVersion(
  policyVersionId: string,
  triggerEvent: 'POLICY_ISSUED' | 'POLICY_RENEWED',
): Promise<void> {
  await enqueueForTrigger(triggerEvent, 'send-policy-survey-invite', `policyversion_${policyVersionId}`, (surveyId): SendPolicySurveyInviteJobData => ({
    surveyId,
    policyVersionId,
    triggerEvent,
  }));
}
