/**
 * Consumer side of "a ticket was just assigned to a PERSON, tell them" —
 * see backend/api/src/modules/case-management/notify-case-assignment-queue.ts
 * for the producer and why this is a dedicated job rather than an
 * AutomationRule action.
 *
 * Creates one IN_APP + one EMAIL Notification for the assignee. The EMAIL
 * row is picked up asynchronously by notification-email-dispatch.job.ts —
 * nothing is sent over SMTP here, matching notify-team-assignment.job.ts.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';

export const NOTIFY_CASE_ASSIGNMENT_QUEUE_NAME = 'notify-case-assignment';

// Mirrors (not imports) the api-side NotifyCaseAssignmentJobData — api and
// worker are independently deployable apps with no shared package for this,
// the same boundary every other job pair in this directory documents.
export interface NotifyCaseAssignmentJobData {
  caseId: string;
  assigneeId: string;
  assignedById?: string;
  assignedAt: string;
  /** See the producer's comment: without this the lookup below runs against
   * `public` and silently finds nothing for every real tenant. */
  tenantSchema?: string | null;
}

export interface NotifyCaseAssignmentResult {
  status: 'notified' | 'skipped-not-found' | 'skipped-self';
}

export async function notifyCaseAssignment(data: NotifyCaseAssignmentJobData): Promise<NotifyCaseAssignmentResult> {
  if (data.assignedById && data.assignedById === data.assigneeId) return { status: 'skipped-self' };

  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: data.tenantSchema ?? null }, async () => {
    const prisma = getPrismaClient();
    const [kase, assignee] = await Promise.all([
      prisma.case.findUnique({ where: { id: data.caseId } }),
      prisma.user.findUnique({ where: { id: data.assigneeId }, select: { id: true, status: true } }),
    ]);

    if (!kase || !assignee) {
      // Loud: BullMQ records this as a completed job, so a silent return
      // here is indistinguishable from success and would hide exactly the
      // bug this job was written to fix.
      console.error(
        `[case-management] notify-case-assignment NOT SENT — case ${data.caseId} / user ${data.assigneeId} not found in schema ` +
          `"${data.tenantSchema ?? 'public'}" (case=${Boolean(kase)}, user=${Boolean(assignee)})`,
      );
      return { status: 'skipped-not-found' };
    }

    const title = `Ticket ${kase.caseNumber} assigned to you`;
    const body = `"${kase.subject}" (${kase.caseNumber}) was assigned to you.`;
    // assignedAt is part of the key so re-assigning the same ticket back to
    // the same person later notifies again, while a BullMQ retry of THIS
    // job stays idempotent against the unique index on dedupeKey.
    const keyBase = `case-assigned:${kase.id}:${data.assigneeId}:${data.assignedAt}`;

    await prisma.notification.createMany({
      data: [
        {
          recipientUserId: assignee.id,
          type: 'CASE_ASSIGNED',
          title,
          body,
          relatedEntityType: 'CASE',
          relatedEntityId: kase.id,
          channel: 'IN_APP' as const,
          status: 'PENDING' as const,
          dedupeKey: `${keyBase}:IN_APP`,
        },
        {
          recipientUserId: assignee.id,
          type: 'CASE_ASSIGNED',
          title,
          body,
          relatedEntityType: 'CASE',
          relatedEntityId: kase.id,
          channel: 'EMAIL' as const,
          status: 'PENDING' as const,
          dedupeKey: `${keyBase}:EMAIL`,
        },
      ],
      skipDuplicates: true,
    });

    return { status: 'notified' };
  });
}

export function createNotifyCaseAssignmentQueue(connection: Redis): Queue {
  return new Queue(NOTIFY_CASE_ASSIGNMENT_QUEUE_NAME, { connection });
}

export function createNotifyCaseAssignmentWorker(connection: Redis): Worker {
  return new Worker(
    NOTIFY_CASE_ASSIGNMENT_QUEUE_NAME,
    async (job: Job<NotifyCaseAssignmentJobData>) => {
      const result = await notifyCaseAssignment(job.data);
      console.log(`[case-management] notify-case-assignment ${job.id}: ${result.status}`);
      return result;
    },
    { connection },
  );
}
