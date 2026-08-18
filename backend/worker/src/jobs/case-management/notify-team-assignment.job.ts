/**
 * Consumer side of "a ticket was just assigned to a team, tell every
 * member" — see backend/api/src/modules/case-management/
 * notify-team-assignment-queue.ts's header comment for the producer side
 * and why this is a dedicated job rather than a SEND_NOTIFICATION/
 * SEND_EMAIL AutomationRule action. Fans out one IN_APP + one EMAIL
 * Notification per current TeamMember, mirroring the exact fan-out shape
 * SEND_NOTIFICATION's recipientTeamId branch already uses in
 * automation/handlers.ts — EMAIL rows are picked up asynchronously by the
 * existing notification-email-dispatch.job.ts, not sent here directly.
 * Runs under SYSTEM_JOB_CONTEXT, same as renewal-scan.job.ts: this needs
 * to see the Case/Team/TeamMember rows regardless of which user triggered
 * the assignment, not whatever a request-scoped RLS context could see.
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';

export const NOTIFY_TEAM_ASSIGNMENT_QUEUE_NAME = 'notify-team-assignment';

// Mirrors (not imports) the api-side NotifyTeamAssignmentJobData — api and
// worker are independently deployable apps with no shared package for
// this, same boundary every other job pair in this directory documents.
export interface NotifyTeamAssignmentJobData {
  caseId: string;
  teamId: string;
  /** Which tenant's schema the Case/Team rows live in. Without it this job
   * ran against `public` and silently found nothing for every real tenant —
   * returning 'skipped' as a COMPLETED job, so team-assignment notifications
   * were quietly dropped org-wide. Optional so jobs enqueued before this
   * field existed still parse. */
  tenantSchema?: string | null;
}

export interface NotifyTeamAssignmentResult {
  status: 'notified' | 'skipped';
  recipientCount: number;
}

export async function notifyTeamAssignment(data: NotifyTeamAssignmentJobData): Promise<NotifyTeamAssignmentResult> {
  return runWithRlsContext({ ...SYSTEM_JOB_CONTEXT, tenantSchema: data.tenantSchema ?? null }, async () => {
    const prisma = getPrismaClient();
    const [kase, team, members] = await Promise.all([
      prisma.case.findUnique({ where: { id: data.caseId } }),
      prisma.team.findUnique({ where: { id: data.teamId } }),
      prisma.teamMember.findMany({ where: { teamId: data.teamId }, select: { userId: true } }),
    ]);
    if (!kase || !team || members.length === 0) {
      console.warn(
        `[case-management] notify-team-assignment skipped — case ${data.caseId} / team ${data.teamId} in schema ` +
          `"${data.tenantSchema ?? 'public'}" (case=${Boolean(kase)}, team=${Boolean(team)}, members=${members.length})`,
      );
      return { status: 'skipped', recipientCount: 0 };
    }

    const title = `Ticket ${kase.caseNumber} assigned to your team`;
    const body = `"${kase.subject}" (${kase.caseNumber}) was assigned to ${team.name}.`;

    await prisma.notification.createMany({
      data: members.flatMap(({ userId }) => [
        {
          recipientUserId: userId,
          type: 'CASE_ASSIGNED_TO_TEAM',
          title,
          body,
          relatedEntityType: 'CASE',
          relatedEntityId: kase.id,
          channel: 'IN_APP' as const,
          status: 'PENDING' as const,
          dedupeKey: `case-assigned-to-team:${kase.id}:${data.teamId}:${userId}:IN_APP`,
        },
        {
          recipientUserId: userId,
          type: 'CASE_ASSIGNED_TO_TEAM',
          title,
          body,
          relatedEntityType: 'CASE',
          relatedEntityId: kase.id,
          channel: 'EMAIL' as const,
          status: 'PENDING' as const,
          dedupeKey: `case-assigned-to-team:${kase.id}:${data.teamId}:${userId}:EMAIL`,
        },
      ]),
      skipDuplicates: true,
    });

    return { status: 'notified', recipientCount: members.length };
  });
}

export function createNotifyTeamAssignmentQueue(connection: Redis): Queue {
  return new Queue(NOTIFY_TEAM_ASSIGNMENT_QUEUE_NAME, { connection });
}

export function createNotifyTeamAssignmentWorker(connection: Redis): Worker {
  return new Worker(
    NOTIFY_TEAM_ASSIGNMENT_QUEUE_NAME,
    async (job: Job<NotifyTeamAssignmentJobData>) => {
      const result = await notifyTeamAssignment(job.data);
      console.log(`[case-management] notify-team-assignment ${job.id}: ${result.status} (${result.recipientCount} recipient(s))`);
      return result;
    },
    { connection },
  );
}
