import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type PendingRoleGrant } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AuditService } from '../../common/audit/audit.service';
import { DecideRoleGrantDto, PendingRoleGrantResponseDto } from './dto/role-grant.dto';

type GrantWithNames = PendingRoleGrant & {
  user: { fullName: string };
  role: { name: string };
  requestedBy: { fullName: string };
};

function toDto(grant: GrantWithNames, chainId: string, approvedCount: number, requiredApprovals: number): PendingRoleGrantResponseDto {
  return {
    id: grant.id,
    userId: grant.userId,
    userName: grant.user.fullName,
    roleId: grant.roleId,
    roleName: grant.role.name,
    requestedById: grant.requestedById,
    requestedByName: grant.requestedBy.fullName,
    chainId,
    approvedCount,
    requiredApprovals,
    createdAt: grant.createdAt,
  };
}

/**
 * Approve/reject side of a role grant gated by Role.requiredApprovalsToGrant
 * > 1 — see UsersController.assignRole()'s header comment for the create
 * side. Gated by the same 'approval' resource (not 'identity') every other
 * approval-decision endpoint in this codebase uses (see
 * policy-version.controller.ts's decideApproval(), approval-threshold-
 * rules.controller.ts) — deciding an approval is that resource's own
 * concern, distinct from whether the decider separately holds 'identity'
 * write access themselves.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/role-grants')
export class RoleGrantsController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('approval', 'read')
  @ApiOkResponse({ type: [PendingRoleGrantResponseDto] })
  async list(): Promise<PendingRoleGrantResponseDto[]> {
    const prisma = getPrismaClient();
    const grants = await prisma.pendingRoleGrant.findMany({
      include: { user: { select: { fullName: true } }, role: { select: { name: true } }, requestedBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const chains = await prisma.approvalChain.findMany({
      where: { entityType: 'USER_ROLE_CHANGE', entityId: { in: grants.map((g) => g.id) }, status: 'PENDING' },
    });
    const chainByGrantId = new Map(chains.map((c) => [c.entityId, c]));

    return Promise.all(
      grants.map(async (g) => {
        const chain = chainByGrantId.get(g.id);
        const approvedCount = chain ? await prisma.approval.count({ where: { chainId: chain.id, status: 'APPROVED' } }) : 0;
        return toDto(g, chain?.id ?? '', approvedCount, chain?.requiredApprovals ?? 1);
      }),
    );
  }

  @Post(':id/decision')
  @RequirePermission('approval', 'write')
  @ApiOkResponse({ type: PendingRoleGrantResponseDto })
  async decide(
    @Param('id') id: string,
    @Body() dto: DecideRoleGrantDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PendingRoleGrantResponseDto> {
    const prisma = getPrismaClient();
    const grant = await prisma.pendingRoleGrant.findUnique({
      where: { id },
      include: { user: { select: { fullName: true } }, role: { select: { name: true } }, requestedBy: { select: { fullName: true } } },
    });
    if (!grant) throw new NotFoundException('Pending role grant not found');

    const chain = await prisma.approvalChain.findFirst({ where: { entityType: 'USER_ROLE_CHANGE', entityId: id, status: 'PENDING' } });
    if (!chain) throw new NotFoundException('No pending approval for this role grant');

    // Segregation of duties — same check (and same reasoning) as
    // policy-version.controller.ts's decideChainedApproval().
    if (grant.requestedById === user.id) {
      throw new ForbiddenException('Cannot decide your own approval request');
    }
    const alreadyDecided = await prisma.approval.findFirst({ where: { chainId: chain.id, approvedById: user.id } });
    if (alreadyDecided) {
      throw new ForbiddenException('You have already decided on this approval chain');
    }

    if (dto.decision === 'REJECTED') {
      await prisma.approval.create({
        data: {
          entityType: 'USER_ROLE_CHANGE',
          entityId: id,
          requestedById: grant.requestedById,
          approvedById: user.id,
          status: 'REJECTED',
          decidedAt: new Date(),
          reason: dto.reason,
          chainId: chain.id,
        },
      });
      await prisma.approvalChain.update({ where: { id: chain.id }, data: { status: 'REJECTED' } });
      await prisma.pendingRoleGrant.delete({ where: { id } });
      return toDto(grant, chain.id, 0, chain.requiredApprovals);
    }

    await prisma.approval.create({
      data: {
        entityType: 'USER_ROLE_CHANGE',
        entityId: id,
        requestedById: grant.requestedById,
        approvedById: user.id,
        status: 'APPROVED',
        decidedAt: new Date(),
        reason: dto.reason,
        chainId: chain.id,
      },
    });
    const approvedCount = await prisma.approval.count({ where: { chainId: chain.id, status: 'APPROVED' } });

    if (approvedCount < chain.requiredApprovals) {
      return toDto(grant, chain.id, approvedCount, chain.requiredApprovals);
    }

    // Fully approved — apply the effect (create the real UserRole) and
    // clean up the pending row, mirroring how a chained PolicyVersion
    // approval applies its own effect only once satisfied.
    await prisma.approvalChain.update({ where: { id: chain.id }, data: { status: 'APPROVED' } });
    await prisma.userRole.create({ data: { userId: grant.userId, roleId: grant.roleId } });
    await prisma.pendingRoleGrant.delete({ where: { id } });

    // user_roles is a composite-PK table, not covered by the generic audit
    // trigger — same reasoning UsersController.assignRole()'s immediate-
    // grant path already documents for its own explicit call.
    await this.auditService.recordEvent({
      action: 'PERMISSION_CHANGE',
      entityType: 'user_roles',
      entityId: grant.userId,
      changedFields: { roleId: grant.roleId, roleName: grant.role.name, grant: true, approvedViaChainId: chain.id },
    });

    return toDto(grant, chain.id, approvedCount, chain.requiredApprovals);
  }
}
