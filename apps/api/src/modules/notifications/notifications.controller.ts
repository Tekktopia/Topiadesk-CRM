import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { NotificationResponseDto } from './dto/notification-response.dto';

/**
 * Foundation stub. Batch 1 Agent D owns apps/api/src/modules/notifications/:
 * dispatch (email/in-app), the renewal-alert idempotency contract consumed
 * by the worker's scan job.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('notifications')
export class NotificationsController {
  @Get()
  @ApiOkResponse({ type: [NotificationResponseDto] })
  async listMine(): Promise<NotificationResponseDto[]> {
    // recipient_user_id-scoped by RLS (prisma/rls/002_policies.sql:
    // notifications_rw) — no manual filter needed.
    return getPrismaClient().notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }
}
