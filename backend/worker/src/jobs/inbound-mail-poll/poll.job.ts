/**
 * Scheduled IMAP mailbox poll — the "enter your mailbox login, save, it
 * just works" ticket-email path (see backend/api/src/modules/integrations/
 * inbound-email-settings.controller.ts for the settings side, and that
 * file's own header comment for why this exists alongside, not instead of,
 * the DNS/push-webhook path in omnichannel/inbound-email.controller.ts).
 *
 * Deliberately does NOT reimplement Case/Activity creation, SLA-clock
 * starting, or threading here — every one of those already exists, tested,
 * on the webhook path. Each polled message is translated into that exact
 * webhook's own payload shape and POSTed to it internally (this worker to
 * the api service, same network the frontend's own server-to-server calls
 * already use — see frontend/web/lib/api/server-fetch.ts's identical
 * API_INTERNAL_URL-over-API_URL preference), authenticated with the same
 * shared secret the webhook already checks. One code path creates tickets
 * from email, regardless of how the email arrived.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { loadEnv, decryptSecret } from '@topiadesk/config';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';

export const INBOUND_MAIL_POLL_QUEUE_NAME = 'inbound-mail-poll';
const INBOUND_MAIL_POLL_SCHEDULER_ID = 'inbound-mail-poll-sweep';
/** Freshdesk-adjacent responsiveness without hammering a real mailbox provider's IMAP rate limits. */
const POLL_INTERVAL_MS = 3 * 60_000;
/** A stuck IMAP server must not hang the whole sweep for every other tenant behind it. */
const CONNECT_TIMEOUT_MS = 20_000;

export interface InboundMailPollResult {
  tenantSchema: string;
  messagesFound: number;
  messagesIngested: number;
  failed: boolean;
}

async function listActiveTenantSchemas(): Promise<string[]> {
  const tenants = await runWithRlsContext(SYSTEM_JOB_CONTEXT, () =>
    getPlatformPrismaClient().tenant.findMany({ where: { status: 'ACTIVE' }, select: { schemaName: true } }),
  );
  return tenants.map((t) => t.schemaName);
}

function webhookUrl(): string {
  const env = loadEnv();
  // Raw process.env read, not part of @topiadesk/config's validated schema —
  // that schema is frontend/web-specific for this particular var (see its
  // lib/env.ts). Same Docker-embedded-DNS reasoning applies here: the
  // public API_URL hostname doesn't resolve from inside another container.
  const base = process.env.API_INTERNAL_URL ?? env.API_URL;
  return `${base}/public/webhooks/inbound-email`;
}

async function postToInboundWebhook(payload: { from: string; to: string; subject: string; text: string; messageId: string; inReplyTo?: string }): Promise<void> {
  const env = loadEnv();
  const res = await fetch(webhookUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-omnichannel-webhook-secret': env.OMNICHANNEL_WEBHOOK_SECRET },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`inbound-email webhook returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function pollOneTenant(tenantSchema: string): Promise<InboundMailPollResult> {
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema }, async () => {
    const prisma = getPrismaClient();
    const result: InboundMailPollResult = { tenantSchema, messagesFound: 0, messagesIngested: 0, failed: false };

    const settings = await prisma.mailSettings.findFirst();
    if (!settings?.inboundIsActive || !settings.inboundHost || !settings.inboundUsername || !settings.inboundEncryptedPassword) {
      return result;
    }

    const client = new ImapFlow({
      host: settings.inboundHost,
      port: settings.inboundPort ?? 993,
      secure: settings.inboundSecure,
      auth: { user: settings.inboundUsername, pass: decryptSecret(settings.inboundEncryptedPassword) },
      logger: false,
      socketTimeout: CONNECT_TIMEOUT_MS,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock(settings.inboundFolder);
      try {
        // imapflow's search() returns `false` (not an empty array) when the
        // server rejects the search itself, distinct from "zero matches".
        const searchResult = await client.search({ seen: false }, { uid: true });
        const uids = searchResult || [];
        result.messagesFound = uids.length;

        for (const uid of uids) {
          try {
            const message = await client.fetchOne(uid, { source: true }, { uid: true });
            if (!message || typeof message === 'boolean' || !message.source) continue;
            const parsed = await simpleParser(message.source);

            const from = parsed.from?.text ?? settings.inboundUsername;
            const to = Array.isArray(parsed.to) ? parsed.to[0]?.text : parsed.to?.text;
            const messageId = parsed.messageId ?? `imap-${tenantSchema}-${uid}`;
            const inReplyTo = Array.isArray(parsed.inReplyTo) ? parsed.inReplyTo[0] : parsed.inReplyTo;

            await postToInboundWebhook({
              from,
              to: to ?? settings.inboundUsername,
              subject: parsed.subject ?? '(no subject)',
              text: parsed.text ?? '',
              messageId,
              ...(inReplyTo ? { inReplyTo } : {}),
            });

            // Only marked \Seen AFTER a successful ingest — a webhook-side
            // failure (network blip, api restart mid-poll) must leave the
            // message eligible for the next sweep rather than silently
            // dropping it.
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
            result.messagesIngested += 1;
          } catch (err) {
            console.error(`[inbound-mail-poll] ${tenantSchema}: failed to ingest message uid ${uid}`, err);
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
      await prisma.mailSettings.update({
        where: { id: settings.id },
        data: { inboundLastPolledAt: new Date(), inboundLastPollError: null },
      });
    } catch (err) {
      result.failed = true;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[inbound-mail-poll] ${tenantSchema}: connection failed`, err);
      await prisma.mailSettings
        .update({ where: { id: settings.id }, data: { inboundLastPolledAt: new Date(), inboundLastPollError: message.slice(0, 500) } })
        .catch(() => undefined);
      await client.logout().catch(() => undefined);
    }

    return result;
  });
}

export async function runInboundMailPoll(): Promise<InboundMailPollResult[]> {
  const results: InboundMailPollResult[] = [];
  for (const tenantSchema of await listActiveTenantSchemas()) {
    try {
      results.push(await pollOneTenant(tenantSchema));
    } catch (err) {
      // One tenant's mail server being unreachable must not stop the sweep
      // for every other tenant behind it — same isolation every other
      // per-tenant scheduled job in this codebase relies on.
      console.error(`[inbound-mail-poll] tenant ${tenantSchema} failed`, err);
      results.push({ tenantSchema, messagesFound: 0, messagesIngested: 0, failed: true });
    }
  }
  return results;
}

export function createInboundMailPollQueue(connection: Redis): Queue {
  return new Queue(INBOUND_MAIL_POLL_QUEUE_NAME, { connection });
}

export async function scheduleInboundMailPoll(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(INBOUND_MAIL_POLL_SCHEDULER_ID, { every: POLL_INTERVAL_MS }, { name: 'poll' });
}

export function createInboundMailPollWorker(connection: Redis): Worker {
  return new Worker(
    INBOUND_MAIL_POLL_QUEUE_NAME,
    async (_job: Job) => {
      const results = await runInboundMailPoll();
      const active = results.filter((r) => r.messagesFound > 0 || r.failed);
      const ingested = results.reduce((n, r) => n + r.messagesIngested, 0);
      const failures = results.filter((r) => r.failed).length;
      console.log(`[inbound-mail-poll] ${active.length} mailbox(es) with activity, ${ingested} message(s) ingested, ${failures} failure(s)`);
      return results;
    },
    { connection },
  );
}
