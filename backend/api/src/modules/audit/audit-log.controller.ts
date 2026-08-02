import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';

const AUDIT_ACTOR_INCLUDE = { actorUser: { select: { id: true, fullName: true, email: true } } } satisfies Prisma.AuditLogInclude;

type AuditLogWithActor = Prisma.AuditLogGetPayload<{ include: typeof AUDIT_ACTOR_INCLUDE }>;

function toAuditLogDto(row: AuditLogWithActor): AuditLogResponseDto {
  return { ...row, id: row.id.toString() };
}

/**
 * Read-only. `audit_log` is structurally append-only — see
 * packages/db/prisma/rls/002_policies.sql's audit_log_select policy (rows
 * only visible to callers holding an ALL-scope audit_log:read grant — ADMIN
 * and COMPLIANCE_OFFICER per seed.ts) and triggers/001's REVOKE of UPDATE/
 * DELETE at the DB role level. @RequirePermission below is the coarse
 * app-layer 403 gate; RLS is the layer that actually can't be bypassed even
 * if this guard had a bug (see require-permission.decorator.ts).
 */
@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('audit-log')
export class AuditLogController {
  @Get()
  @RequirePermission('audit_log', 'read')
  @ApiOkResponse({ type: [AuditLogResponseDto] })
  async list(@Query() query: AuditLogQueryDto): Promise<AuditLogResponseDto[]> {
    const hasDateFilter = query.from !== undefined || query.to !== undefined;
    const rows = await getPrismaClient().auditLog.findMany({
      where: {
        entityType: query.entityType,
        entityId: query.entityId,
        actorUserId: query.actorUserId,
        action: query.action,
        createdAt: hasDateFilter
          ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined }
          : undefined,
      },
      include: AUDIT_ACTOR_INCLUDE,
      // id (not createdAt) is the bigint identity PK kept specifically for
      // monotonic chain ordering across the 8 hash-chain lanes — see
      // schema.prisma's AuditLog model comment.
      orderBy: { id: 'desc' },
      take: query.take ?? 50,
      skip: query.skip ?? 0,
    });
    return rows.map(toAuditLogDto);
  }
}
