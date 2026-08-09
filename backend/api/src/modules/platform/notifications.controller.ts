import { Controller, Get, NotFoundException, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { PlatformNotificationResponseDto } from './dto/platform-notification.dto';

/**
 * Broadcast feed for the Global Admin bell (frontend/global-admin/app/
 * app-header.tsx) — every platform admin sees every row, and read state is
 * shared (see PlatformNotification's own schema doc comment for why: team
 * scale makes a per-recipient model unnecessary complexity for now). No
 * guard here, matching platform-audit-log.controller.ts's same read-only
 * posture — PlatformContextMiddleware (see this controller's required
 * registration in app.module.ts's forRoutes() list) is the only gate.
 */
@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform/notifications')
export class PlatformNotificationsController {
  @Get()
  @ApiOkResponse({ type: [PlatformNotificationResponseDto] })
  async list(@Query('unreadOnly') unreadOnly?: string, @Query('limit') limit?: string): Promise<PlatformNotificationResponseDto[]> {
    const take = Math.min(Number(limit) || 50, 200);
    return getPlatformPrismaClient().platformNotification.findMany({
      where: unreadOnly === 'true' ? { readAt: null } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /**
   * Atomic conditional update (WHERE readAt IS NULL), not a plain update —
   * shared read-state means two admins clicking the same item near-
   * simultaneously must not let the second write clobber the first
   * admin's readAt; first writer wins, both end up seeing the same
   * (first) timestamp. Idempotent on retry: a second call against an
   * already-read row is a no-op, not an error.
   */
  @Patch(':id/read')
  @ApiOkResponse({ type: PlatformNotificationResponseDto })
  async markRead(@Param('id') id: string): Promise<PlatformNotificationResponseDto> {
    const prisma = getPlatformPrismaClient();
    await prisma.platformNotification.updateMany({ where: { id, readAt: null }, data: { readAt: new Date() } });
    const updated = await prisma.platformNotification.findUnique({ where: { id } });
    if (!updated) throw new NotFoundException(`Notification ${id} not found`);
    return updated;
  }
}
