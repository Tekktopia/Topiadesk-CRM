import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';

/**
 * Producer side of a bulk-invited employee's welcome email — same
 * producer/consumer split as portal-login-queue.ts (API enqueues, the
 * worker's own `bulk-invite-email` Worker at backend/worker/src/jobs/
 * identity/send-bulk-invite-email.job.ts sends it via the shared nodemailer
 * transporter). The API process never opens an SMTP connection itself.
 * Deliberately a per-row enqueue (not a single job carrying the whole
 * batch) — see users.controller.ts's bulkInvite() header comment: the
 * Keycloak user + local row are already durably created by the time this
 * is called, so a lost/delayed email job here only ever delays a welcome
 * email, never leaves a half-created account.
 */
const BULK_INVITE_EMAIL_QUEUE_NAME = 'bulk-invite-email';

let connection: Redis | undefined;
let queue: Queue | undefined;

function getQueue(): Queue {
  if (!queue) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(BULK_INVITE_EMAIL_QUEUE_NAME, { connection });
  }
  return queue;
}

export interface SendBulkInviteEmailJobData {
  email: string;
  fullName: string;
  temporaryPassword: string;
}

/** Fire-and-forget, same reasoning as enqueuePortalLoginEmail — additive to
 * a request that already committed the Keycloak user + local row; a Redis
 * hiccup here must never fail (or partially undo) an already-created
 * account. */
export async function enqueueBulkInviteEmail(data: SendBulkInviteEmailJobData): Promise<void> {
  try {
    const q = getQueue();
    await q.add('send-bulk-invite-email', data satisfies SendBulkInviteEmailJobData, { removeOnComplete: true, removeOnFail: 100 });
  } catch (err) {
    console.error('[identity] failed to enqueue bulk-invite welcome email', err);
  }
}
