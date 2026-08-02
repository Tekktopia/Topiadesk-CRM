import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { AuditService } from '../../common/audit/audit.service';
import { CreateRoleDto, ListRolesQueryDto, RoleResponseDto, UpdateRoleDto } from './dto/role.dto';
import { GrantPermissionDto } from './dto/permission.dto';
import { rethrowAsHttpException } from './prisma-error.util';

type RoleWithPermissions = Prisma.RoleGetPayload<{ include: { permissions: { include: { permission: true } } } }>;

const ROLE_WITH_PERMISSIONS_INCLUDE = { permissions: { include: { permission: true } } } satisfies Prisma.RoleInclude;

function toRoleResponse(role: RoleWithPermissions): RoleResponseDto {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystemRole: role.isSystemRole,
    createdAt: role.createdAt,
    permissions: role.permissions.map((rp) => ({
      id: rp.permission.id,
      resource: rp.permission.resource,
      action: rp.permission.action,
      scope: rp.permission.scope,
    })),
  };
}

/**
 * Role administration + RolePermission grant/revoke. Grant changes are
 * compliance-sensitive and are NOT covered by the generic DB audit trigger
 * (role_permissions has a composite PK, no `id` column — see schema.prisma
 * and prisma/triggers/002_audit_chain_triggers.sql's comment), so every
 * grant/revoke here calls AuditService.recordEvent() with PERMISSION_CHANGE
 * explicitly. `roles` itself IS covered by the generic trigger for plain
 * name/description edits.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/roles')
export class RolesController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [RoleResponseDto] })
  async list(@Query() query: ListRolesQueryDto): Promise<RoleResponseDto[]> {
    const roles = await getPrismaClient().role.findMany({
      where: query.isSystemRole !== undefined ? { isSystemRole: query.isSystemRole === 'true' } : undefined,
      include: ROLE_WITH_PERMISSIONS_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return roles.map(toRoleResponse);
  }

  @Get(':id')
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: RoleResponseDto })
  async get(@Param('id') id: string): Promise<RoleResponseDto> {
    const role = await getPrismaClient().role.findUnique({ where: { id }, include: ROLE_WITH_PERMISSIONS_INCLUDE });
    if (!role) throw new NotFoundException('Role not found');
    return toRoleResponse(role);
  }

  @Post()
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: RoleResponseDto })
  async create(@Body() dto: CreateRoleDto): Promise<RoleResponseDto> {
    try {
      const role = await getPrismaClient().role.create({
        data: { name: dto.name, description: dto.description, isSystemRole: false },
        include: ROLE_WITH_PERMISSIONS_INCLUDE,
      });
      return toRoleResponse(role);
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Patch(':id')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: RoleResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto): Promise<RoleResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Role not found');
    if (existing.isSystemRole && dto.name !== undefined && dto.name !== existing.name) {
      throw new BadRequestException(
        'Cannot rename a system role — ADMIN/SYSTEM_JOB are referenced by name directly in RLS policies and PermissionGuard',
      );
    }
    try {
      const updated = await prisma.role.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
        },
        include: ROLE_WITH_PERMISSIONS_INCLUDE,
      });
      return toRoleResponse(updated);
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Delete(':id')
  @RequirePermission('identity', 'write')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    const prisma = getPrismaClient();
    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Role not found');
    if (existing.isSystemRole) throw new BadRequestException('Cannot delete a system role');
    try {
      await prisma.role.delete({ where: { id } });
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Post(':id/permissions')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: RoleResponseDto })
  async grantPermission(@Param('id') roleId: string, @Body() dto: GrantPermissionDto): Promise<RoleResponseDto> {
    const prisma = getPrismaClient();
    const [role, permission] = await Promise.all([
      prisma.role.findUnique({ where: { id: roleId } }),
      prisma.permission.findUnique({ where: { id: dto.permissionId } }),
    ]);
    if (!role) throw new NotFoundException('Role not found');
    if (!permission) throw new NotFoundException('Permission not found');

    try {
      await prisma.rolePermission.create({ data: { roleId, permissionId: dto.permissionId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Role already has this permission grant');
      }
      throw err;
    }

    await this.auditService.recordEvent({
      action: 'PERMISSION_CHANGE',
      entityType: 'role_permissions',
      entityId: roleId,
      changedFields: {
        permissionId: dto.permissionId,
        resource: permission.resource,
        action: permission.action,
        scope: permission.scope,
        grant: true,
      },
    });

    const updated = await prisma.role.findUniqueOrThrow({ where: { id: roleId }, include: ROLE_WITH_PERMISSIONS_INCLUDE });
    return toRoleResponse(updated);
  }

  @Delete(':id/permissions/:permissionId')
  @RequirePermission('identity', 'write')
  @HttpCode(200)
  @ApiOkResponse({ type: RoleResponseDto })
  async revokePermission(@Param('id') roleId: string, @Param('permissionId') permissionId: string): Promise<RoleResponseDto> {
    const prisma = getPrismaClient();
    const permission = await prisma.permission.findUnique({ where: { id: permissionId } });

    try {
      await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId, permissionId } } });
    } catch (err) {
      rethrowAsHttpException(err);
    }

    await this.auditService.recordEvent({
      action: 'PERMISSION_CHANGE',
      entityType: 'role_permissions',
      entityId: roleId,
      changedFields: {
        permissionId,
        resource: permission?.resource ?? null,
        action: permission?.action ?? null,
        scope: permission?.scope ?? null,
        grant: false,
      },
    });

    const updated = await prisma.role.findUniqueOrThrow({ where: { id: roleId }, include: ROLE_WITH_PERMISSIONS_INCLUDE });
    return toRoleResponse(updated);
  }
}
