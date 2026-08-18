import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getRlsContext } from '@topiadesk/db';

/**
 * Producer side of the portal magic-link email — same producer/consumer
 * split as survey-dispatch-queue.ts (api enqueues, the worker's own
 * `portal-login` Worker at backend/worker/src/jobs/portal/
 * send-portal-login-link.job.ts sends it via the shared nodemailer
 * transporter). The API process never opens an SMTP connection itself —
 * see that worker file's header comment for why email-sending lives there
 * exclusively.
 */
const PORTAL_LOGIN_QUEUE_NAME = 'portal-login';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(PORTAL_LOGIN_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface SendPortalLoginLinkJobData {
  email: string;
  token: string;
  tenantSchema: string | null;
}

/**
 * Fire-and-forget, same reasoning as enqueueEntityEvent/enqueueSurveyInvites:
 * additive to a request that already committed the PortalLoginToken row —
 * a Redis hiccup here must never fail the request or, worse, leak whether
 * the email matched via a differently-timed/shaped error response.
 */
export async function enqueuePortalLoginEmail(email: string, token: string): Promise<void> {
  try {
    const q = getQueue();
    await q.add(
      'send-portal-login-link',
      // Capture the tenant at enqueue time — the worker cannot infer it, and
      // without it the token lookup runs against `public` and the email is
      // silently never sent.
      { email, token, tenantSchema: getRlsContext()?.tenantSchema ?? null } satisfies SendPortalLoginLinkJobData,
      { removeOnComplete: true, removeOnFail: 100 },
    );
  } catch (err) {
    console.error('[portal] failed to enqueue login link email', err);
  }
}
