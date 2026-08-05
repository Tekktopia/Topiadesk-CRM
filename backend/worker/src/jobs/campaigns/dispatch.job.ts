/**
 * Campaign send/schedule dispatch — the counterpart to
 * backend/api/src/modules/campaigns/campaigns.controller.ts's orchestration
 * endpoints. Postgres-durable poll (~60s, mirrors the exact durable-poll
 * pattern in renewal-alerts/renewal-scan.job.ts — read that file's header
 * comment for why this style beats scheduling far in advance in Redis)
 * PLUS an ad-hoc BullMQ job the api enqueues directly for latency-sensitive
 * actions (send now, resume, A/B decide-winner) — see
 * campaign-dispatch-queue.ts on the api side for the producer.
 *
 * Status machine:
 *   DRAFT -> [schedule] -> SCHEDULED (scheduledSendAt set)
 *   DRAFT|SCHEDULED -> [send] -> SCHEDULED (scheduledSendAt = now) + immediate job
 *   SCHEDULED -> [this job, once due] -> SENDING
 *   SENDING -> [this job drains PENDING-eligible recipients] -> SENT (once zero PENDING remain)
 *   SENDING -> [pause] -> PAUSED -> [resume] -> SENDING + immediate job
 *   any pre-SENT status -> [cancel] -> CANCELLED
 *
 * Recipient materialization timing is the one genuinely non-obvious design
 * decision here (the schema has no explicit "frozen segment snapshot"
 * table — see AudienceSegment's schema comment): a NON-dynamic segment is
 * materialized into CampaignRecipient rows the first time this job notices
 * the campaign is SCHEDULED, regardless of whether scheduledSendAt is
 * actually due yet ("at schedule time", to within this job's ~60s poll
 * granularity) — later changes to segment membership can't change who
 * receives it. A DYNAMIC segment is deliberately NOT materialized during
 * the SCHEDULED phase; it's resolved fresh the first time the campaign
 * reaches SENDING and is about to actually drain recipients ("at send
 * time"). Both paths funnel through materializeIfEmpty(), which is a
 * no-op once CampaignRecipient rows already exist for the campaign — that
 * idempotency check is what makes repeated poll ticks safe.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { loadEnv } from '@topiadesk/config';
import { CampaignChannel, getPrismaClient, Prisma, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { buildContactWhereFromFilters, type SegmentFilterGroupInput } from './segment-filters';
import { resolveMergeFields, substituteMergeFields, type ContactForMergeFields } from './merge-fields';
import { sendCampaignEmail } from './mailer';
import { signUnsubscribeToken } from './unsubscribe-token.util';

export const CAMPAIGN_DISPATCH_QUEUE_NAME = 'campaign-dispatch';
const CAMPAIGN_DISPATCH_POLL_SCHEDULER_ID = 'campaign-dispatch-poll-scheduler';
const CAMPAIGN_DISPATCH_POLL_INTERVAL_MS = 60 * 1000;

export interface CampaignDispatchJobData {
  /** Present for an ad-hoc "act on this one campaign now" job (api-enqueued); absent for the repeatable poll tick. */
  campaignId?: string;
}

type PrismaClient = ReturnType<typeof getPrismaClient>;
type CampaignWithRelations = Prisma.CampaignGetPayload<{ include: { segment: true; template: true; variants: true } }>;

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function normalizeAddress(v: string | null | undefined): string | null {
  return v ? v.trim().toLowerCase() : null;
}

interface VariantSplit {
  id: string;
  splitPercent: number;
}

/** Largest-remainder (Hare-quota) allocation — proportional to splitPercent without relying on randomness, so the split is exactly reproducible from the same inputs. */
function allocateVariantCounts(sampleSize: number, variants: VariantSplit[]): Map<string, number> {
  const totalSplit = variants.reduce((sum, v) => sum + v.splitPercent, 0) || 100;
  const raw = variants.map((v) => (sampleSize * v.splitPercent) / totalSplit);
  const floors = raw.map(Math.floor);
  const allocated = floors.reduce((a, b) => a + b, 0);
  const remainder = sampleSize - allocated;
  const order = raw.map((r, i) => ({ i, frac: r - floors[i]! })).sort((a, b) => b.frac - a.frac);
  const counts = [...floors];
  for (let k = 0; k < remainder && k < order.length; k++) counts[order[k]!.i]! += 1;
  const result = new Map<string, number>();
  variants.forEach((v, i) => result.set(v.id, counts[i]!));
  return result;
}

/** First `abTestSamplePercent`% of `contacts` (in the given, deterministic order) get split across variants per allocateVariantCounts; the remainder is held back (variantId null) pending a decide-winner call. */
function splitContactsForAbTest<T extends { id: string }>(
  contacts: T[],
  variants: VariantSplit[],
  samplePercent: number,
): Array<{ contact: T; variantId: string | null }> {
  const sampleSize = Math.round((contacts.length * samplePercent) / 100);
  const counts = allocateVariantCounts(sampleSize, variants);
  const assignments: Array<{ contact: T; variantId: string | null }> = [];
  let idx = 0;
  for (const v of variants) {
    const n = counts.get(v.id) ?? 0;
    for (let k = 0; k < n && idx < contacts.length; k++, idx++) assignments.push({ contact: contacts[idx]!, variantId: v.id });
  }
  for (; idx < contacts.length; idx++) assignments.push({ contact: contacts[idx]!, variantId: null });
  return assignments;
}

async function filterSuppressed<T extends { id: string; email: string | null; phone: string | null }>(
  prisma: PrismaClient,
  contacts: T[],
  channel: CampaignChannel,
): Promise<T[]> {
  if (contacts.length === 0) return [];
  const contactIds = contacts.map((c) => c.id);
  const addresses = contacts.map((c) => normalizeAddress(channel === CampaignChannel.EMAIL ? c.email : c.phone)).filter((v): v is string => v !== null);
  const rows = await prisma.campaignSuppression.findMany({
    where: { channel, OR: [{ contactId: { in: contactIds } }, { emailOrPhone: { in: addresses } }] },
  });
  const suppressedContactIds = new Set(rows.map((r) => r.contactId).filter((v): v is string => v !== null));
  const suppressedAddresses = new Set(rows.map((r) => r.emailOrPhone));
  return contacts.filter((c) => {
    if (suppressedContactIds.has(c.id)) return false;
    const addr = normalizeAddress(channel === CampaignChannel.EMAIL ? c.email : c.phone);
    return !(addr && suppressedAddresses.has(addr));
  });
}

/** No-op once CampaignRecipient rows already exist for this campaign — see this file's header comment for why WHEN this gets called (SCHEDULED phase for non-dynamic segments, SENDING phase for dynamic ones) is the actual freeze-vs-refresh decision. */
async function materializeIfEmpty(prisma: PrismaClient, campaign: CampaignWithRelations): Promise<void> {
  const existingCount = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } });
  if (existingCount > 0) return;
  if (!campaign.segmentId || !campaign.segment) return;

  const filters = campaign.segment.filters as unknown as SegmentFilterGroupInput;
  const segmentWhere = buildContactWhereFromFilters(filters);
  const channelFilter: Record<string, unknown> = campaign.channel === CampaignChannel.EMAIL ? { email: { not: null } } : { phone: { not: null } };
  const where = { AND: [segmentWhere, channelFilter] } as unknown as Prisma.ContactWhereInput;

  const contacts = await prisma.contact.findMany({ where, orderBy: { id: 'asc' } });
  if (contacts.length === 0) return;

  const eligible = await filterSuppressed(prisma, contacts, campaign.channel);

  const assignments =
    campaign.abTestEnabled && campaign.variants.length > 0
      ? splitContactsForAbTest(eligible, campaign.variants.map((v) => ({ id: v.id, splitPercent: v.splitPercent })), campaign.abTestSamplePercent ?? 100)
      : eligible.map((c) => ({ contact: c, variantId: null as string | null }));

  for (const { contact, variantId } of assignments) {
    const dedupeKey = `campaign:${campaign.id}:${contact.id}:${campaign.channel}`;
    await prisma.campaignRecipient
      .create({ data: { campaignId: campaign.id, contactId: contact.id, variantId, channel: campaign.channel, status: 'PENDING', dedupeKey } })
      .catch((err: unknown) => {
        if (!isUniqueConstraintViolation(err)) throw err;
      });
  }
}

async function drainRecipients(prisma: PrismaClient, campaign: CampaignWithRelations, now: Date): Promise<void> {
  const pending = await prisma.campaignRecipient.findMany({
    where: { campaignId: campaign.id, status: 'PENDING' },
    include: { variant: { include: { template: true } } },
  });

  for (const recipient of pending) {
    // Held back pending an A/B test decide-winner call — see
    // splitContactsForAbTest above (variantId null = not in the initial
    // test sample).
    if (campaign.abTestEnabled && !recipient.variantId) continue;

    const fresh = await prisma.campaign.findUnique({ where: { id: campaign.id }, select: { status: true } });
    if (fresh?.status !== 'SENDING') break; // paused/cancelled mid-drain

    const template = recipient.variant?.template ?? campaign.template;
    if (!template) {
      await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'FAILED', failureReason: 'No template resolved for this recipient' } });
      continue;
    }

    const contact = await prisma.contact.findUnique({
      where: { id: recipient.contactId },
      include: { account: { include: { policies: { orderBy: { expiryDate: 'asc' }, take: 1, include: { renewalSchedule: true } } } } },
    });
    if (!contact) {
      await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'FAILED', failureReason: 'Contact no longer exists' } });
      continue;
    }

    const rawAddress = campaign.channel === CampaignChannel.EMAIL ? contact.email : contact.phone;
    if (!rawAddress) {
      const missing = campaign.channel === CampaignChannel.EMAIL ? 'email' : 'phone';
      await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'FAILED', failureReason: `Contact has no ${missing} on file` } });
      continue;
    }
    const emailOrPhone = normalizeAddress(rawAddress)!;

    // Compliance backstop, checked fresh immediately before EVERY send, no
    // exceptions: materialize-time suppression filtering isn't enough on
    // its own since someone can unsubscribe between materialization and
    // actual send (especially for a dynamic segment resolved once at
    // materialize-then-immediately-drain time, but also for a long-paused
    // campaign resumed days later).
    const suppressed = await prisma.campaignSuppression.findFirst({ where: { channel: campaign.channel, OR: [{ emailOrPhone }, { contactId: contact.id }] } });
    if (suppressed) {
      await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'UNSUBSCRIBED', unsubscribedAt: now } });
      continue;
    }

    const mergeValues = resolveMergeFields(contact as ContactForMergeFields);
    const unsubToken = signUnsubscribeToken({ contactId: contact.id, channel: campaign.channel, emailOrPhone });
    const unsubLink = `${loadEnv().API_URL}/public/unsubscribe?token=${unsubToken}`;

    if (campaign.channel === CampaignChannel.EMAIL) {
      try {
        const subject = substituteMergeFields(template.subject ?? campaign.name, mergeValues);
        const html = template.bodyHtml
          ? `${substituteMergeFields(template.bodyHtml, mergeValues)}<p style="font-size:11px;color:#888">Don't want these emails? <a href="${unsubLink}">Unsubscribe</a></p>`
          : undefined;
        const text = template.bodyText ? `${substituteMergeFields(template.bodyText, mergeValues)}\n\nUnsubscribe: ${unsubLink}` : undefined;
        const { messageId } = await sendCampaignEmail({ to: rawAddress, subject, html, text });
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'SENT', sentAt: now, queuedAt: now, externalMessageId: messageId },
        });
      } catch (err) {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'FAILED', failureReason: err instanceof Error ? err.message : 'Unknown email send error' },
        });
      }
    } else {
      // SMS/WHATSAPP: deliberately stubbed — there is no Twilio/WhatsApp
      // Business API credential in this environment. Logs and marks QUEUED
      // (never SENT — that would be faking success) so the rest of the
      // status-tracking flow (provider webhook -> DELIVERED/OPENED/etc,
      // see campaign-webhooks.controller.ts) is still exercisable once a
      // real provider is wired in; only the actual network call is missing.
      console.log(
        `[campaign-dispatch] STUB ${campaign.channel} send to ${rawAddress} (recipient ${recipient.id}, campaign ${campaign.id}) — no real provider configured in this environment`,
      );
      await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'QUEUED', queuedAt: now } });
    }
  }

  const freshCampaign = await prisma.campaign.findUnique({ where: { id: campaign.id }, select: { status: true, sentAt: true } });
  if (freshCampaign?.status !== 'SENDING') return; // paused/cancelled mid-drain — leave status as-is

  if (campaign.abTestEnabled && !campaign.abTestDecidedAt) {
    // Test-sample phase only — deliberately ignores held-back
    // (variantId=null) recipients, which never leave PENDING until a
    // decide-winner call assigns them a variantId. sentAt here marks "the
    // test sample finished sending", which is exactly what
    // ab-test-resolve.job.ts's fixed post-sentAt window measures from;
    // status deliberately stays SENDING (not SENT) until the post-decision
    // remainder also drains.
    const testSamplePending = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: 'PENDING', variantId: { not: null } } });
    if (testSamplePending === 0 && !freshCampaign.sentAt) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { sentAt: now } });
    }
    return;
  }

  const remainingPending = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: 'PENDING' } });
  if (remainingPending === 0) {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'SENT', sentAt: freshCampaign.sentAt ?? now } });
  }
}

/**
 * Exported standalone (not just wired as a BullMQ processor) so it can be
 * invoked directly — from ab-test-resolve.job.ts after assigning the
 * winning variant to held-back recipients, from an integration test, or a
 * one-off manual run. Assumes it's already running inside a bound RLS
 * context (SYSTEM_JOB_CONTEXT) — callers are responsible for that, same
 * convention as runRenewalScan/runCampaignDispatchPoll below.
 */
export async function dispatchCampaign(campaignId: string, now: Date = new Date()): Promise<void> {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { segment: true, template: true, variants: true },
  });
  if (!campaign) return;
  if (campaign.status !== 'SCHEDULED' && campaign.status !== 'SENDING') return;

  let status = campaign.status;
  if (status === 'SCHEDULED') {
    if (campaign.segment && !campaign.segment.isDynamic) await materializeIfEmpty(prisma, campaign);
    if (campaign.scheduledSendAt && campaign.scheduledSendAt > now) return; // materialize-only tick, not due yet
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'SENDING' } });
    status = 'SENDING';
  }
  void status;

  if (campaign.segment && campaign.segment.isDynamic) await materializeIfEmpty(prisma, campaign);

  await drainRecipients(prisma, campaign, now);
}

export interface CampaignDispatchPollResult {
  campaignsConsidered: number;
}

/** Always runs under SYSTEM_JOB — background dispatch needs to see every org-wide SCHEDULED/SENDING campaign, not whatever a request-scoped user could see; RLS-protected tables fail closed (zero rows) without a bound context. */
export async function runCampaignDispatchPoll(now: Date = new Date()): Promise<CampaignDispatchPollResult> {
  return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
    const prisma = getPrismaClient();
    const campaigns = await prisma.campaign.findMany({ where: { status: { in: ['SCHEDULED', 'SENDING'] } }, select: { id: true } });
    for (const c of campaigns) await dispatchCampaign(c.id, now);
    return { campaignsConsidered: campaigns.length };
  });
}

export function createCampaignDispatchQueue(connection: Redis): Queue<CampaignDispatchJobData> {
  return new Queue<CampaignDispatchJobData>(CAMPAIGN_DISPATCH_QUEUE_NAME, { connection });
}

export function createCampaignDispatchWorker(connection: Redis): Worker<CampaignDispatchJobData> {
  return new Worker<CampaignDispatchJobData>(
    CAMPAIGN_DISPATCH_QUEUE_NAME,
    async (job: Job<CampaignDispatchJobData>) => {
      if (job.data.campaignId) {
        const campaignId = job.data.campaignId;
        await runWithRlsContext(SYSTEM_JOB_CONTEXT, () => dispatchCampaign(campaignId));
        return;
      }
      const result = await runCampaignDispatchPoll();
      console.log(`[campaign-dispatch] poll tick: ${result.campaignsConsidered} campaign(s) considered`);
    },
    { connection },
  );
}

/** Safe to call on every worker boot — upsertJobScheduler is idempotent by scheduler id, same as renewal-scan's scheduleRenewalScan. */
export async function scheduleCampaignDispatchPoll(queue: Queue<CampaignDispatchJobData>): Promise<void> {
  await queue.upsertJobScheduler(CAMPAIGN_DISPATCH_POLL_SCHEDULER_ID, { every: CAMPAIGN_DISPATCH_POLL_INTERVAL_MS }, { name: 'poll', data: {} });
}
