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
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AuditService } from '../../common/audit/audit.service';
import { AssignRoleDto, ListUsersQueryDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { PendingRoleGrantResponseDto } from './dto/role-grant.dto';
import { ForceLogoutResponseDto, KeycloakSessionResponseDto } from './dto/keycloak-session-response.dto';
import { BulkInviteResultRowDto, BulkInviteUsersDto } from './dto/bulk-invite-users.dto';
import { rethrowAsHttpException } from './prisma-error.util';
import { enqueueBulkInviteEmail } from './send-bulk-invite-email-queue';
// NOT type-only imports: constructor-injected below — see the same
// footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { KeycloakAdminService } from './keycloak-admin.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UserProvisioningService } from './user-provisioning.service';

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? fullName;
  const lastName = parts.slice(1).join(' ') || firstName;
  return { firstName, lastName };
}

/** Must satisfy the realm's own passwordPolicy (12+ chars, upper/lower/
 * digit/special) — a one-time value the user is forced to change on first
 * sign-in (resetPassword's `temporary: true` credential flag), never
 * displayed or logged beyond the one-time welcome email. Duplicated (not
 * imported) from keycloak-realm-provisioning.ts — that file lives in
 * backend/worker, a separately deployable app. */
function generateTemporaryPassword(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `Tdk!${random}A1`;
}

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
    private readonly userProvisioning: UserProvisioningService,
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

  /**
   * The one self-service "bring my team into the system" path — everything
   * else that creates a User row is Keycloak-sync-owned (see this class's
   * own header comment) or SCIM (external-IdP-only). Sequential, not a
   * queued batch job — mirrors this codebase's existing "small N,
   * loop-per-row" bulk convention (e.g. admin/users' client-side bulk
   * deactivate/reactivate) rather than inventing a new batch abstraction;
   * max 200 rows (BulkInviteUsersDto) keeps a worst-case request bounded.
   * Each row: local email-uniqueness check, Keycloak createUser +
   * resetPassword (mirrors ScimController.doCreateUser()'s proven
   * sequence), then upsertLocalUser — with a best-effort compensating
   * setEnabled(false) if a later step fails after Keycloak succeeded, so a
   * transient DB error can't leave an orphaned, enabled, blank-password
   * Keycloak account. One row failing never aborts the batch; every row's
   * outcome is reported back. No seat-limit check here — see this
   * session's plan for why: that check today only exists platform-side
   * against Subscription.plan.seatLimit (db-platform), and reaching into
   * that schema from a tenant-authenticated request would break the
   * "one request touches one schema" RLS invariant PlatformContext/RLS
   * session-var sharing depends on.
   */
  @Post('bulk-invite')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ type: [BulkInviteResultRowDto] })
  async bulkInvite(@Body() dto: BulkInviteUsersDto): Promise<BulkInviteResultRowDto[]> {
    const prisma = getPrismaClient();
    const results: BulkInviteResultRowDto[] = [];

    for (const row of dto.rows) {
      try {
        const existing = await prisma.user.findUnique({ where: { email: row.email } });
        if (existing) {
          results.push({ email: row.email, status: 'skipped', reason: 'A user with this email already exists' });
          continue;
        }

        const { firstName, lastName } = splitName(row.fullName);

        let keycloakUserId: string;
        try {
          keycloakUserId = await this.keycloakAdmin.createUser({
            username: row.email,
            email: row.email,
            firstName,
            lastName,
            enabled: true,
            emailVerified: true,
          });
        } catch (err) {
          results.push({ email: row.email, status: 'failed', reason: `Keycloak account: ${err instanceof Error ? err.message : String(err)}` });
          continue;
        }

        const temporaryPassword = generateTemporaryPassword();
        try {
          await this.keycloakAdmin.resetPassword(keycloakUserId, temporaryPassword);
        } catch (err) {
          await this.keycloakAdmin.setEnabled(keycloakUserId, false).catch(() => undefined);
          results.push({ email: row.email, status: 'failed', reason: `Keycloak password: ${err instanceof Error ? err.message : String(err)}` });
          continue;
        }

        let provisioned: { userId: string | null };
        try {
          provisioned = await this.userProvisioning.upsertLocalUser({
            keycloakSubjectId: keycloakUserId,
            email: row.email,
            firstName,
            lastName,
            enabled: true,
            departmentCode: row.departmentCode,
            branchCode: row.branchCode,
          });
        } catch (err) {
          await this.keycloakAdmin.setEnabled(keycloakUserId, false).catch(() => undefined);
          results.push({ email: row.email, status: 'failed', reason: `Local record: ${err instanceof Error ? err.message : String(err)}` });
          continue;
        }

        // entity_id is a real uuid column (audit_log) — one event per
        // created row, not a synthetic batch-level id.
        if (provisioned.userId) {
          await this.auditService.recordEvent({ action: 'CREATE', entityType: 'users', entityId: provisioned.userId });
        }
        await enqueueBulkInviteEmail({ email: row.email, fullName: row.fullName, temporaryPassword });
        results.push({ email: row.email, status: 'created' });
      } catch (err) {
        results.push({ email: row.email, status: 'failed', reason: err instanceof Error ? err.message : String(err) });
      }
    }

    return results;
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

  /**
   * Immediate grant when the target Role's requiredApprovalsToGrant is 1
   * (every role's default — today's behavior, byte-for-byte unchanged).
   * When it's >1 (ADMIN/COMPLIANCE_OFFICER, seeded to 2), this instead
   * creates a PendingRoleGrant + ApprovalChain (entityType
   * USER_ROLE_CHANGE — pre-reserved in ApprovalEntityType, unused until
   * now) and returns PendingRoleGrantResponseDto, NOT UserResponseDto — no
   * UserRole row exists yet. See role-grants.controller.ts for the
   * decide side, which mirrors policy-version.controller.ts's
   * decideChainedApproval() shape.
   */
  @Post(':id/roles')
  @RequirePermission('identity', 'write')
  @ApiOkResponse({ schema: { oneOf: [{ $ref: '#/components/schemas/UserResponseDto' }, { $ref: '#/components/schemas/PendingRoleGrantResponseDto' }] } })
  async assignRole(
    @Param('id') userId: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actingUser: AuthenticatedUser,
  ): Promise<UserResponseDto | PendingRoleGrantResponseDto> {
    const prisma = getPrismaClient();
    const [user, role] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.role.findUnique({ where: { id: dto.roleId } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (!role) throw new NotFoundException('Role not found');

    const existingRole = await prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId: dto.roleId } } });
    if (existingRole) throw new ConflictException('User already has this role');

    if (role.requiredApprovalsToGrant > 1) {
      const existingPending = await prisma.pendingRoleGrant.findFirst({ where: { userId, roleId: dto.roleId } });
      if (existingPending) throw new ConflictException('A grant of this role is already pending approval for this user');

      const grant = await prisma.pendingRoleGrant.create({
        data: { userId, roleId: dto.roleId, requestedById: actingUser.id },
        include: { user: { select: { fullName: true } }, role: { select: { name: true } }, requestedBy: { select: { fullName: true } } },
      });
      const chain = await prisma.approvalChain.create({
        data: { entityType: 'USER_ROLE_CHANGE', entityId: grant.id, requiredApprovals: role.requiredApprovalsToGrant, status: 'PENDING' },
      });
      return {
        id: grant.id,
        userId: grant.userId,
        userName: grant.user.fullName,
        roleId: grant.roleId,
        roleName: grant.role.name,
        requestedById: grant.requestedById,
        requestedByName: grant.requestedBy.fullName,
        chainId: chain.id,
        approvedCount: 0,
        requiredApprovals: chain.requiredApprovals,
        createdAt: grant.createdAt,
      };
    }

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
