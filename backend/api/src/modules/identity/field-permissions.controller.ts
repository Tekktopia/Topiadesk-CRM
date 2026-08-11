import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { AuditService } from '../../common/audit/audit.service';
import { FIELD_PERMISSION_CATALOG } from '../../common/field-permissions/field-visibility.util';
import { FieldPermissionResponseDto, ListFieldPermissionsQueryDto, UpsertFieldPermissionDto } from './dto/field-permission.dto';

/**
 * Field-Level Security admin — see FieldPermission's schema.prisma comment
 * for the full design (opt-in restriction, most-permissive-across-roles).
 * Gated the same way RolesController's grant/revoke endpoints are — this IS
 * a permission grant, just at field rather than resource granularity, so it
 * gets the same PERMISSION_CHANGE audit trail treatment.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/field-permissions')
export class FieldPermissionsController {
  constructor(private readonly auditService: AuditService) {}

  @Get('catalog')
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: 'object' })
  catalog(): Record<string, string[]> {
    return FIELD_PERMISSION_CATALOG;
  }

  @Get()
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [FieldPermissionResponseDto] })
  async list(@Query() query: ListFieldPermissionsQueryDto): Promise<FieldPermissionResponseDto[]> {
    return getPrismaClient().fieldPermission.findMany({
      where: { roleId: query.roleId, resource: query.resource },
      orderBy: [{ resource: 'asc' }, { fieldName: 'asc' }],
    });
  }

  /** Upsert on the (roleId, resource, fieldName) unique key — one call sets or changes a field's visibility for a role, no separate create-vs-update distinction the UI needs to track. */
  @Post()
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: FieldPermissionResponseDto })
  async upsert(@Body() dto: UpsertFieldPermissionDto): Promise<FieldPermissionResponseDto> {
    const validFields = FIELD_PERMISSION_CATALOG[dto.resource] ?? [];
    if (!validFields.includes(dto.fieldName)) {
      throw new BadRequestException(`"${dto.fieldName}" is not a gate-able field on "${dto.resource}" — valid fields: ${validFields.join(', ') || '(none)'}`);
    }
    const prisma = getPrismaClient();
    const role = await prisma.role.findUnique({ where: { id: dto.roleId }, select: { id: true, name: true } });
    if (!role) throw new NotFoundException('Role not found');

    const row = await prisma.fieldPermission.upsert({
      where: { roleId_resource_fieldName: { roleId: dto.roleId, resource: dto.resource, fieldName: dto.fieldName } },
      create: { roleId: dto.roleId, resource: dto.resource, fieldName: dto.fieldName, visibility: dto.visibility },
      update: { visibility: dto.visibility },
    });

    await this.auditService.recordEvent({
      action: 'PERMISSION_CHANGE',
      entityType: 'field_permissions',
      entityId: row.id,
      changedFields: { roleId: dto.roleId, roleName: role.name, resource: dto.resource, fieldName: dto.fieldName, visibility: dto.visibility },
    });

    return row;
  }

  @Delete(':id')
  @RequirePermission('identity', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.fieldPermission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Field permission not found');
    await prisma.fieldPermission.delete({ where: { id } });

    await this.auditService.recordEvent({
      action: 'PERMISSION_CHANGE',
      entityType: 'field_permissions',
      entityId: id,
      changedFields: { roleId: existing.roleId, resource: existing.resource, fieldName: existing.fieldName, visibility: null },
    });

    return { deleted: true };
  }
}
