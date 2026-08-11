import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { ApprovalDelegationResponseDto, ColleagueOptionDto, CreateApprovalDelegationDto } from './dto/approval.dto';

/**
 * Self-service "while I'm out, my named-approver workflow gates also
 * decide for X" (see ApprovalDelegation's schema comment and
 * approval_delegations_rw/approvals_rw/automation_run_states_rw in
 * prisma/rls/002_policies.sql for where this actually takes effect). No
 * @RequirePermission, same reasoning as ApprovalsController: RLS already
 * restricts every row to "I'm the delegator, I'm the delegate, or I hold
 * approval:read/write at ALL scope" — an app-layer gate on top would only
 * ever narrow an already-correct result.
 */
@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('approvals/delegations')
export class ApprovalDelegationsController {
  @Get()
  @ApiOkResponse({ type: [ApprovalDelegationResponseDto] })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ApprovalDelegationResponseDto[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.approvalDelegation.findMany({
      include: { delegator: { select: { fullName: true } }, delegate: { select: { fullName: true } } },
      orderBy: { startsAt: 'desc' },
    });
    const now = Date.now();
    return rows.map((row) => ({
      id: row.id,
      delegatorId: row.delegatorId,
      delegatorName: row.delegator?.fullName ?? null,
      delegateId: row.delegateId,
      delegateName: row.delegate?.fullName ?? null,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      note: row.note,
      createdAt: row.createdAt,
      isActive: row.startsAt.getTime() <= now && now <= row.endsAt.getTime(),
      isMine: row.delegatorId === user.id,
      standsInFor: 'CASE_AUTOMATION_GATE',
    }));
  }

  @Get('colleagues')
  @ApiOkResponse({ type: [ColleagueOptionDto] })
  async colleagues(@CurrentUser() user: AuthenticatedUser): Promise<ColleagueOptionDto[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.user.findMany({
      where: { id: { not: user.id }, status: 'ACTIVE' },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
      take: 200,
    });
    return rows;
  }

  @Post()
  @ApiOkResponse({ type: ApprovalDelegationResponseDto })
  async create(@Body() dto: CreateApprovalDelegationDto, @CurrentUser() user: AuthenticatedUser): Promise<ApprovalDelegationResponseDto> {
    if (dto.delegateId === user.id) {
      throw new BadRequestException('You cannot delegate to yourself');
    }
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    const prisma = getPrismaClient();
    const delegate = await prisma.user.findUnique({ where: { id: dto.delegateId }, select: { id: true, fullName: true } });
    if (!delegate) throw new NotFoundException('Delegate not found');

    const row = await prisma.approvalDelegation.create({
      data: { delegatorId: user.id, delegateId: dto.delegateId, startsAt, endsAt, note: dto.note },
      include: { delegator: { select: { fullName: true } }, delegate: { select: { fullName: true } } },
    });
    const now = Date.now();
    return {
      id: row.id,
      delegatorId: row.delegatorId,
      delegatorName: row.delegator?.fullName ?? null,
      delegateId: row.delegateId,
      delegateName: row.delegate?.fullName ?? null,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      note: row.note,
      createdAt: row.createdAt,
      isActive: row.startsAt.getTime() <= now && now <= row.endsAt.getTime(),
      isMine: true,
      standsInFor: 'CASE_AUTOMATION_GATE',
    };
  }

  @Delete(':id')
  @ApiOkResponse({ schema: { properties: { deleted: { type: 'boolean' } } } })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const row = await prisma.approvalDelegation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Delegation not found');
    if (row.delegatorId !== user.id) {
      throw new ForbiddenException('Only the delegator can revoke this delegation');
    }
    await prisma.approvalDelegation.delete({ where: { id } });
    return { deleted: true };
  }
}
