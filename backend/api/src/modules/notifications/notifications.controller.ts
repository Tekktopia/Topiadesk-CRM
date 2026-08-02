import { Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
// NOT a type-only import: NotificationsService is constructor-injected
// below — see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationsService } from './notifications.service';
import { NotificationResponseDto } from './dto/notification-response.dto';

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
  async listMine(): Promise<NotificationResponseDto[]> {
    // recipient_user_id-scoped by RLS (prisma/rls/002_policies.sql:
    // notifications_rw) — no manual filter needed.
    return getPrismaClient().notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
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
}
