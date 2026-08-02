import { createHash } from 'node:crypto';
import { Body, Controller, Get, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, getRlsContext, Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { AuditService } from '../../common/audit/audit.service';
import { OrgSettingResponseDto, SetOrgSettingDto } from './dto/org-setting.dto';

/**
 * `org_settings` has no id column (PK is `key`), and audit_log.entity_id is
 * uuid-typed — so there's no natural entity_id to record for it. Derive a
 * stable synthetic UUID from the key (not random) so every change to the
 * SAME key lands under the same audit_log.entity_id, keeping its history
 * queryable as one thread. Version/variant nibbles are just cosmetic here;
 * Postgres's uuid type only checks the 8-4-4-4-12 hex shape.
 */
function deterministicUuidFromKey(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Generic key/value get/set — do not special-case renewal.default_alert_
 * thresholds_days or security.mfa_required_roles here; consumers read those
 * keys directly, this API just stores arbitrary JSON under arbitrary keys.
 * Writes are NOT covered by the generic audit trigger (see comment in
 * prisma/triggers/002_audit_chain_triggers.sql), so every set() call records
 * an explicit AuditService event.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/org-settings')
export class OrgSettingsController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [OrgSettingResponseDto] })
  async list(): Promise<OrgSettingResponseDto[]> {
    return getPrismaClient().orgSetting.findMany({ orderBy: { key: 'asc' } });
  }

  @Get(':key')
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: OrgSettingResponseDto })
  async get(@Param('key') key: string): Promise<OrgSettingResponseDto> {
    const setting = await getPrismaClient().orgSetting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException('Org setting not found');
    return setting;
  }

  @Put(':key')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: OrgSettingResponseDto })
  async set(@Param('key') key: string, @Body() dto: SetOrgSettingDto): Promise<OrgSettingResponseDto> {
    const prisma = getPrismaClient();
    const ctx = getRlsContext();
    const existing = await prisma.orgSetting.findUnique({ where: { key } });
    const jsonValue = dto.value === null ? Prisma.JsonNull : (dto.value as Prisma.InputJsonValue);

    const updated = await prisma.orgSetting.upsert({
      where: { key },
      create: { key, value: jsonValue, updatedById: ctx?.userId },
      update: { value: jsonValue, updatedById: ctx?.userId },
    });

    await this.auditService.recordEvent({
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'org_settings',
      entityId: deterministicUuidFromKey(key),
      changedFields: { key, oldValue: existing?.value ?? null, newValue: dto.value },
    });

    return updated;
  }
}
