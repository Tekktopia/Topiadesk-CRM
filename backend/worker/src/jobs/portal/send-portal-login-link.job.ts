/**
 * Consumer side of the portal magic-link email — see
 * backend/api/src/modules/portal/portal-login-queue.ts's header comment for
 * the producer side. The job payload only carries {email, token} (never the
 * composed email body/contact context) — this worker re-resolves the
 * PortalLoginToken by hashing `token` the same way the API did when it
 * created the row, giving us the real Contact/Account to address the email
 * to without trusting anything client-supplied beyond the token itself.
 *
 * hashPortalToken() is duplicated (not imported) from the api-side
 * portal-token.util.ts — api and worker are independently deployable apps
 * with no shared package for this, same boundary send-case-survey-invite.job.ts's
 * own header comment documents for its merge-fields duplication.
 */
import { createHash } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { sendMail } from '../scheduled-reports/mailer';

export const PORTAL_LOGIN_QUEUE_NAME = 'portal-login';

// Mirrors (not imports) the api-side SendPortalLoginLinkJobData in
// portal-login-queue.ts — same app-boundary duplication as hashPortalToken
// below.
export interface SendPortalLoginLinkJobData {
  email: string;
  token: string;
}

function hashPortalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type SendResult = { status: 'sent' | 'skipped-consumed-or-expired' };

export async function sendPortalLoginLink(data: SendPortalLoginLinkJobData): Promise<SendResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const loginToken = await prisma.portalLoginToken.findUnique({
      where: { tokenHash: hashPortalToken(data.token) },
      include: { contact: { include: { account: { select: { name: true } } } } },
    });
    // Between enqueue and this (possibly delayed) run the token may already
    // have been consumed or expired — don't send a link that's dead on
    // arrival.
    if (!loginToken || loginToken.consumedAt || loginToken.expiresAt < new Date()) {
      return { status: 'skipped-consumed-or-expired' };
    }

    const env = loadEnv();
    const link = `${env.APP_URL}/portal/auth/${data.token}`;
    const firstName = loginToken.contact.firstName || 'there';
    const accountName = loginToken.contact.account?.name;
    await sendMail({
      to: data.email,
      subject: 'Your TopiaDesk portal sign-in link',
      text: `Hi ${firstName},\n\nHere's your sign-in link${accountName ? ` for ${accountName}` : ''}: ${link}\n\nThis link expires in 15 minutes and can only be used once. If you didn't request this, you can safely ignore this email.`,
    });
    return { status: 'sent' };
  });
}

export function createPortalLoginQueue(connection: Redis): Queue {
  return new Queue(PORTAL_LOGIN_QUEUE_NAME, { connection });
}

export function createPortalLoginWorker(connection: Redis): Worker {
  return new Worker(
    PORTAL_LOGIN_QUEUE_NAME,
    async (job: Job<SendPortalLoginLinkJobData>) => {
      const result = await sendPortalLoginLink(job.data);
      console.log(`[portal-login] send-portal-login-link ${job.id}: ${result.status}`);
      return result;
    },
    { connection },
  );
}
