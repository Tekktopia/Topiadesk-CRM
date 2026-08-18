import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
// NOT a type-only import: NotificationsService is constructor-injected
// below — see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationsService } from './notifications.service';
import {
  BulkNotificationIdsDto,
  ListMyNotificationsQueryDto,
  NotificationBulkActionResponseDto,
  NotificationResponseDto,
} from './dto/notification-response.dto';
import { AdminNotificationQueryDto, AdminNotificationResponseDto } from './dto/admin-notification.dto';

/**
 * Foundation stub. Batch 1 Agent D owns backend/api/src/modules/notifications/:
 * dispatch (email/in-app), the renewal-alert idempotency contract consumed
 * by the worker's scan job.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ type: [NotificationResponseDto] })
  async listMine(@Query() query: ListMyNotificationsQueryDto): Promise<NotificationResponseDto[]> {
    // recipient_user_id-scoped by RLS (prisma/rls/002_policies.sql:
    // notifications_rw) — no manual filter needed.
    return getPrismaClient().notification.findMany({
      where: {
        type: query.type,
        readAt: query.isRead === undefined ? undefined : query.isRead === 'true' ? { not: null } : null,
      },
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 50,
      skip: query.skip ?? 0,
    });
  }

  @Patch(':id/read')
  @ApiOkResponse({ type: NotificationResponseDto })
  async markRead(@Param('id') id: string): Promise<NotificationResponseDto> {
    try {
      return await this.notifications.markRead(id);
    } catch (err) {
      // RLS scopes the UPDATE to the caller's own notifications the same
      // way it scopes SELECT — a notification belonging to someone else
      // (or a bad id) both surface as Prisma's P2025 "record not found".
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException(`Notification ${id} not found`);
      }
      throw err;
    }
  }

  /** Marks every one of the caller's own unread notifications as read in a single round trip — the "Mark all as read" button. */
  @Patch('read-all')
  @ApiOkResponse({ schema: { type: 'object', properties: { count: { type: 'number' } } } })
  async markAllRead(): Promise<{ count: number }> {
    const count = await this.notifications.markAllRead();
    return { count };
  }

  /** Notifications can only ever be marked read before this, never removed — this is the single-item delete/dismiss action. RLS-scoped like everything else here; a P2025 (someone else's notification, or a bad id) reads as "not found", not a 500. */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const deleted = await this.notifications.deleteMany([id]);
    if (deleted.length === 0) throw new NotFoundException(`Notification ${id} not found`);
    return { deleted: true };
  }

  /** Bulk-select delete from the inbox table — same requested/affected/skipped shape as crm/dto/bulk-action.dto.ts's BulkActionResponseDto, kept as a local copy rather than a cross-module import (see notification-response.dto.ts). */
  @Post('bulk-delete')
  @ApiOkResponse({ type: NotificationBulkActionResponseDto })
  async bulkDelete(@Body() dto: BulkNotificationIdsDto): Promise<NotificationBulkActionResponseDto> {
    const affected = await this.notifications.deleteMany(dto.ids);
    const affectedSet = new Set(affected);
    return { requested: dto.ids, affected, skipped: dto.ids.filter((id) => !affectedSet.has(id)) };
  }

  /**
   * Org-wide notification browsing for /admin/notifications/all — distinct
   * from listMine() above (which stays RLS-scoped to the caller's own
   * inbox). Gated on 'identity' read, matching every other user-
   * administration surface (users/departments/branches/teams); RLS's own
   * ALL-scope carve-out (notifications_rw, prisma/rls/002_policies.sql) is
   * the real backstop — a non-ALL-scope 'identity' reader calling this
   * still only sees their own rows, gracefully narrowed rather than
   * erroring.
   */
  @Get('admin')
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [AdminNotificationResponseDto] })
  async listAdmin(@Query() query: AdminNotificationQueryDto): Promise<AdminNotificationResponseDto[]> {
    return getPrismaClient().notification.findMany({
      where: {
        recipientUserId: query.recipientUserId,
        type: query.type,
        channel: query.channel as never,
        status: query.status as never,
      },
      include: { recipient: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Re-queues a FAILED email notification by flipping it back to PENDING
   * — the existing notification-email-dispatch.job.ts worker poll picks it
   * up on its next tick (every 3 minutes), no new send logic needed. Only
   * FAILED + EMAIL is eligible: IN_APP has no dispatch job to retry
   * against, and re-sending an already-SENT/READ notification isn't what
   * "resend" should mean here. */
  @Post(':id/resend')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: AdminNotificationResponseDto })
  async resend(@Param('id') id: string): Promise<AdminNotificationResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.notification.findUnique({ where: { id }, include: { recipient: { select: { id: true, fullName: true, email: true } } } });
    if (!existing) throw new NotFoundException(`Notification ${id} not found`);
    if (existing.status !== 'FAILED' || existing.channel !== 'EMAIL') {
      throw new BadRequestException('Only a FAILED email notification can be resent');
    }
    return prisma.notification.update({
      where: { id },
      data: { status: 'PENDING' },
      include: { recipient: { select: { id: true, fullName: true, email: true } } },
    });
  }
}
