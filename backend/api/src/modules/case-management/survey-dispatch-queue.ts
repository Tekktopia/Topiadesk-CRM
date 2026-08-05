import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';

/**
 * Producer side of Survey.triggerEvent === 'CASE_RESOLVED' — the exact
 * integration SurveysService.createSurveyResponse()'s own header comment
 * names as "the obvious first caller" and flags as not built yet. Case
 * status transitions call `enqueueSurveyInvitesForResolvedCase` after
 * their DB write commits (status-transition.util.ts); the worker's
 * `survey-dispatch` BullMQ Worker
 * (backend/worker/src/jobs/surveys/send-case-survey-invite.job.ts)
 * consumes it, creates the SurveyResponse row, and emails the respond
 * link. Same producer/consumer split as automation-events.util.ts — see
 * that file's header comment for why this lives in api rather than a
 * shared package (worker already depends on bullmq/ioredis for its own
 * jobs; this is api's side of that same pattern).
 *
 * Per-survey delay: rather than one job that looks up matching surveys and
 * fans out (which would need a second queue stage to honor each survey's
 * own `sendDelayMinutes`), this enqueues one job per matching active
 * CASE_RESOLVED survey directly, each with its own BullMQ `delay` set from
 * that survey's `sendDelayMinutes` — the API layer already has the survey
 * rows loaded, so there's no reason to defer that lookup to the worker.
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

/**
 * Fire-and-forget, same reasoning as enqueueEntityEvent: survey dispatch is
 * additive to a Case status write that already committed — a Redis hiccup
 * here must never fail that response. jobId is `survey_{surveyId}_case_
 * {caseId}` (underscore-separated — see enqueueEntityEvent's header
 * comment in automation-events.util.ts for why a colon-separated id is
 * unsafe with BullMQ) so a retried/duplicate call for the same case
 * resolution can't double-enqueue (BullMQ treats a duplicate jobId as a
 * no-op add); the worker's own dedupeKey-guarded SurveyResponse create is
 * the second, DB-level idempotency layer for the same reason renewal
 * alerts have both.
 *
 * The Survey lookup runs under SYSTEM_JOB_CONTEXT deliberately, not
 * whatever RLS context the calling request happens to be bound to — this
 * is a system decision ("does resolving this case need to notify a
 * survey"), not something that should depend on the acting user's own
 * permission scope. `surveys_rw` gates reads to `survey:read @ ALL scope`,
 * which most interactive roles (e.g. a broker resolving their own case)
 * don't hold — without this wrap, `findMany` would silently return zero
 * rows for that caller and this would look like "no surveys configured"
 * even when several genuinely active CASE_RESOLVED surveys exist.
 */
export async function enqueueSurveyInvitesForResolvedCase(caseId: string): Promise<void> {
  try {
    const surveys = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
      getPrismaClient().survey.findMany({ where: { triggerEvent: 'CASE_RESOLVED', isActive: true } }),
    );
    if (surveys.length === 0) return;

    const q = getQueue();
    await Promise.all(
      surveys.map((survey) =>
        q.add(
          'send-case-survey-invite',
          { surveyId: survey.id, caseId } satisfies SendCaseSurveyInviteJobData,
          { jobId: `survey_${survey.id}_case_${caseId}`, delay: Math.max(0, survey.sendDelayMinutes) * 60_000, removeOnComplete: true, removeOnFail: 100 },
        ),
      ),
    );
  } catch (err) {
    console.error('[case-management] failed to enqueue survey invites for resolved case', err);
  }
}
