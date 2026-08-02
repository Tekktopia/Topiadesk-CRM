import {
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
import { AssignRoleDto, ListUsersQueryDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { rethrowAsHttpException } from './prisma-error.util';

type UserWithRoles = Prisma.UserGetPayload<{ include: { roles: { include: { role: true } } } }>;

const USER_WITH_ROLES_INCLUDE = { roles: { include: { role: true } } } satisfies Prisma.UserInclude;

function toUserResponse(user: UserWithRoles): UserResponseDto {
  return {
    id: user.id,
    keycloakSubjectId: user.keycloakSubjectId,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    departmentId: user.departmentId,
    branchId: user.branchId,
    status: user.status,
    roles: user.roles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
    lastSyncedAt: user.lastSyncedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * User CRUD (no create — that's Keycloak-sync-owned, see
 * keycloak-webhook.controller.ts) + role assignment. `users` is covered by
 * the generic audit trigger for plain field updates (prisma/triggers/
 * 002_audit_chain_triggers.sql); role grant/revoke is NOT (composite-PK
 * user_roles table), so those two mutations call AuditService explicitly.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/users')
export class UsersController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [UserResponseDto] })
  async list(@Query() query: ListUsersQueryDto): Promise<UserResponseDto[]> {
    const where: Prisma.UserWhereInput = {
      ...(query.departmentId && { departmentId: query.departmentId }),
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    const users = await getPrismaClient().user.findMany({
      where,
      include: USER_WITH_ROLES_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: query.take,
      skip: query.skip,
    });
    return users.map(toUserResponse);
  }

  @Get(':id')
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: UserResponseDto })
  async get(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await getPrismaClient().user.findUnique({ where: { id }, include: USER_WITH_ROLES_INCLUDE });
    if (!user) throw new NotFoundException('User not found');
    return toUserResponse(user);
  }

  @Patch(':id')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: UserResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<UserResponseDto> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.departmentId !== undefined) {
      data.department = dto.departmentId === null ? { disconnect: true } : { connect: { id: dto.departmentId } };
    }
    if (dto.branchId !== undefined) {
      data.branch = dto.branchId === null ? { disconnect: true } : { connect: { id: dto.branchId } };
    }
    try {
      const updated = await getPrismaClient().user.update({ where: { id }, data, include: USER_WITH_ROLES_INCLUDE });
      return toUserResponse(updated);
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Post(':id/deactivate')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: UserResponseDto })
  async deactivate(@Param('id') id: string): Promise<UserResponseDto> {
    try {
      const updated = await getPrismaClient().user.update({
        where: { id },
        data: { status: 'DEACTIVATED' },
        include: USER_WITH_ROLES_INCLUDE,
      });
      return toUserResponse(updated);
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Post(':id/reactivate')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: UserResponseDto })
  async reactivate(@Param('id') id: string): Promise<UserResponseDto> {
    try {
      const updated = await getPrismaClient().user.update({
        where: { id },
        data: { status: 'ACTIVE' },
        include: USER_WITH_ROLES_INCLUDE,
      });
      return toUserResponse(updated);
    } catch (err) {
      rethrowAsHttpException(err);
    }
  }

  @Post(':id/roles')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: UserResponseDto })
  async assignRole(@Param('id') userId: string, @Body() dto: AssignRoleDto): Promise<UserResponseDto> {
    const prisma = getPrismaClient();
    const [user, role] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.role.findUnique({ where: { id: dto.roleId } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (!role) throw new NotFoundException('Role not found');

    try {
      await prisma.userRole.create({ data: { userId, roleId: dto.roleId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('User already has this role');
      }
      throw err;
    }

    await this.auditService.recordEvent({
      action: 'PERMISSION_CHANGE',
      entityType: 'user_roles',
      entityId: userId,
      changedFields: { roleId: dto.roleId, roleName: role.name, grant: true },
    });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: USER_WITH_ROLES_INCLUDE });
    return toUserResponse(updated);
  }

  @Delete(':id/roles/:roleId')
  @RequirePermission('identity', 'write')
  @HttpCode(200)
  @ApiOkResponse({ type: UserResponseDto })
  async revokeRole(@Param('id') userId: string, @Param('roleId') roleId: string): Promise<UserResponseDto> {
    const prisma = getPrismaClient();
    const role = await prisma.role.findUnique({ where: { id: roleId } });

    try {
      await prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
    } catch (err) {
      rethrowAsHttpException(err);
    }

    await this.auditService.recordEvent({
      action: 'PERMISSION_CHANGE',
      entityType: 'user_roles',
      entityId: userId,
      changedFields: { roleId, roleName: role?.name ?? null, grant: false },
    });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: USER_WITH_ROLES_INCLUDE });
    return toUserResponse(updated);
  }
}
