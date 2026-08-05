import {
  BadGatewayException,
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
import { ForceLogoutResponseDto, KeycloakSessionResponseDto } from './dto/keycloak-session-response.dto';
import { rethrowAsHttpException } from './prisma-error.util';
// NOT a type-only import: KeycloakAdminService is constructor-injected
// below — see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { KeycloakAdminService } from './keycloak-admin.service';

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
  constructor(
    private readonly auditService: AuditService,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

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

  /**
   * Distinct from deactivate(): SUSPENDED is a reversible, temporary hold
   * (e.g. pending an investigation) vs DEACTIVATED's permanent-offboarding
   * connotation — both are UserStatus enum members (schema.prisma) and
   * reactivate() above already unconditionally sets ACTIVE regardless of
   * which of the two the user is coming from, so no separate "unsuspend"
   * endpoint is needed.
   */
  @Post(':id/suspend')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: UserResponseDto })
  async suspend(@Param('id') id: string): Promise<UserResponseDto> {
    try {
      const updated = await getPrismaClient().user.update({
        where: { id },
        data: { status: 'SUSPENDED' },
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

  /**
   * Calls Keycloak's `POST /admin/realms/{realm}/users/{id}/logout`, which
   * invalidates every active session AND refresh token for that user —
   * genuinely forces re-authentication, not just an app-side flag. Records
   * AuditAction.FORCE_LOGOUT explicitly: this mutates Keycloak-side state,
   * not a row the generic audit trigger (prisma/triggers/
   * 002_audit_chain_triggers.sql) ever sees.
   */
  @Post(':id/force-logout')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: ForceLogoutResponseDto })
  async forceLogout(@Param('id') id: string): Promise<ForceLogoutResponseDto> {
    const user = await getPrismaClient().user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    try {
      await this.keycloakAdmin.forceLogout(user.keycloakSubjectId);
    } catch (err) {
      throw new BadGatewayException(`Keycloak force-logout failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await this.auditService.recordEvent({ action: 'FORCE_LOGOUT', entityType: 'users', entityId: id });
    return { status: 'ok' };
  }

  /** Read-only proxy to Keycloak's session-list endpoint — no local write, so no audit event (see AuditService's header comment: it's for events with no corresponding row mutation, and this doesn't even mutate Keycloak). */
  @Get(':id/sessions')
  @RequirePermission('identity', 'read')
  @ApiOkResponse({ type: [KeycloakSessionResponseDto] })
  async sessions(@Param('id') id: string): Promise<KeycloakSessionResponseDto[]> {
    const user = await getPrismaClient().user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    try {
      return await this.keycloakAdmin.listSessions(user.keycloakSubjectId);
    } catch (err) {
      throw new BadGatewayException(`Keycloak session list failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
