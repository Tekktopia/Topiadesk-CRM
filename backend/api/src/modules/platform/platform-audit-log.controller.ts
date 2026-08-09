import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPlatformPrismaClient } from '@topiadesk/db-platform';
import { PlatformAuditLogResponseDto } from './dto/platform-audit-log.dto';

/** Read-only by design — no create/edit/delete anywhere in this module, same
 * posture as the tenant schema's own audit log. */
@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform/audit-log')
export class PlatformAuditLogController {
  @Get()
  @ApiOkResponse({ type: [PlatformAuditLogResponseDto] })
  async list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('limit') limit?: string,
  ): Promise<PlatformAuditLogResponseDto[]> {
    const take = Math.min(Number(limit) || 200, 500);
    const entries = await getPlatformPrismaClient().platformAuditLog.findMany({
      where: {
        ...(entityType && { entityType }),
        ...(entityId && { entityId }),
      },
      include: { actorPlatformAdmin: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return entries.map((e) => ({
      id: e.id,
      actorPlatformAdminId: e.actorPlatformAdminId,
      actorName: e.actorPlatformAdmin?.fullName ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      detail: e.detail as Record<string, unknown> | null,
      createdAt: e.createdAt,
    }));
  }
}
