/**
 * Consumer side of a bulk-invited employee's welcome email — see
 * backend/api/src/modules/identity/send-bulk-invite-email-queue.ts's header
 * comment for the producer side. By the time this runs, the Keycloak user
 * and local `users` row already exist (created synchronously in the API
 * request) — this job only ever sends an email, never any part of account
 * creation, so a failure/retry here can't leave a half-created account.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { sendMail } from '../scheduled-reports/mailer';

export const BULK_INVITE_EMAIL_QUEUE_NAME = 'bulk-invite-email';

// Mirrors (not imports) the api-side SendBulkInviteEmailJobData — api and
// worker are independently deployable apps with no shared package for
// this, same boundary send-portal-login-link.job.ts's own header comment
// documents.
export interface SendBulkInviteEmailJobData {
  email: string;
  fullName: string;
  temporaryPassword: string;
}

export async function sendBulkInviteEmail(data: SendBulkInviteEmailJobData): Promise<{ status: 'sent' }> {
  await sendMail({
    to: data.email,
    subject: 'Your TopiaDesk account is ready',
    text: `Hi ${data.fullName},\n\nAn account has been created for you on TopiaDesk.\n\nSign-in username: ${data.email}\nTemporary password: ${data.temporaryPassword}\n\nYou'll be asked to set a new password on first sign-in.`,
  });
  return { status: 'sent' };
}

export function createBulkInviteEmailQueue(connection: Redis): Queue {
  return new Queue(BULK_INVITE_EMAIL_QUEUE_NAME, { connection });
}

export function createBulkInviteEmailWorker(connection: Redis): Worker {
  return new Worker(
    BULK_INVITE_EMAIL_QUEUE_NAME,
    async (job: Job<SendBulkInviteEmailJobData>) => {
      const result = await sendBulkInviteEmail(job.data);
      console.log(`[identity] send-bulk-invite-email ${job.id}: ${result.status}`);
      return result;
    },
    { connection },
  );
}
