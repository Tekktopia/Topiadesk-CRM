import { Injectable, Logger } from '@nestjs/common';
import { getPrismaClient, Prisma, type Notification, type NotificationChannel } from '@topiadesk/db';

export interface CreateNotificationParams {
  recipientUserId: string;
  type: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  /**
   * Load-bearing for idempotency (schema comment on Notification.dedupeKey
   * — unique constraint). Callers construct this deterministically (e.g.
   * `renewal:${renewalScheduleId}:${thresholdDays}` or
   * `ai-daily-cap:${userId}:${yyyy-mm-dd}`) so re-triggering the same
   * logical event (a scan job running twice, a request retried) never
   * produces a duplicate notification.
   */
  dedupeKey: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/**
 * Foundation service other modules call to dispatch notifications — the
 * worker's future renewal-alert scan job is the main intended caller, but
 * anything running inside a bound RLS context can use it today (see
 * ai-gateway.service.ts's daily-cap self-notification for an example).
 *
 * RLS constraint callers must respect (prisma/rls/002_policies.sql,
 * notifications_rw WITH CHECK): `recipientUserId` must equal the RLS
 * session's current user, OR the caller must be running under the
 * SYSTEM_JOB context (background workers, via `runWithRlsContext` +
 * `SYSTEM_JOB_CONTEXT` from @topiadesk/db) — notifications are strictly
 * per-recipient, so an ordinary authenticated-user request context cannot
 * insert a notification for someone else. Self-notifications (recipient ==
 * the calling user) always satisfy this without any context switch.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async createNotification(params: CreateNotificationParams): Promise<Notification | null> {
    try {
      return await getPrismaClient().notification.create({
        data: {
          recipientUserId: params.recipientUserId,
          type: params.type,
          title: params.title,
          body: params.body,
          channel: params.channel,
          dedupeKey: params.dedupeKey,
          relatedEntityType: params.relatedEntityType,
          relatedEntityId: params.relatedEntityId,
          status: 'PENDING',
        },
      });
    } catch (err) {
      // P2002 on the dedupeKey unique constraint = this exact notification
      // was already created (idempotent re-run) — a healthy no-op, not an
      // error. Any other error propagates normally.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.debug(`createNotification: dedupeKey "${params.dedupeKey}" already exists — no-op`);
        return null;
      }
      throw err;
    }
  }

  async markRead(id: string): Promise<Notification> {
    return getPrismaClient().notification.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }
}
