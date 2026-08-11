import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Policy } from '@topiadesk/db';
import { AuditLogResponseDto } from '../audit/dto/audit-log-response.dto';
import { loadEntityHistory } from '../audit/entity-history';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { PolicyResponseDto } from './dto/policy-response.dto';
import { BulkActionResponseDto, BulkAssignPoliciesDto, BulkUpdatePoliciesDto } from './dto/bulk-action.dto';
import { assertValidPolicyTransition } from './policy-lifecycle';
import { decimalToString } from './decimal.util';
import { diffBulkIds } from './bulk-actions';

function toPolicyDto(policy: Policy): PolicyResponseDto {
  return { ...policy, sumInsured: decimalToString(policy.sumInsured) };
}

/**
 * Policy CRUD + lifecycle status transitions. See
 * policy-version.controller.ts for endorsement/renewal/cancellation
 * versioning (and the maker-checker Approval gate), premium.controller.ts,
 * renewal-schedule.controller.ts. All access goes through
 * `getPrismaClient()` inside the RLS context bound by
 * RlsContextMiddleware — Policy visibility is scoped via the linked
 * Account's owner (prisma/rls/002_policies.sql's policies_rw); no manual
 * WHERE filtering here.
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies')
export class PolicyController {
  @Get()
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [PolicyResponseDto] })
  async list(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('q') q?: string,
  ): Promise<PolicyResponseDto[]> {
    const policies = await getPrismaClient().policy.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(accountId ? { accountId } : {}),
        ...(q ? { policyNumber: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { expiryDate: 'asc' },
      take: 100,
    });
    return policies.map(toPolicyDto);
  }

  // Bulk endpoints — mirrors accounts.controller.ts's shape (diffBulkIds +
  // updateMany/per-row loop). Must precede ':id' — Nest matches literal
  // segments in declaration order ahead of a dynamic param competing for
  // the same position. No bulk/delete: policies aren't deletable at all
  // (confirmed — no DELETE endpoint exists on this controller; CANCELLED
  // via bulk/update is the closest equivalent).
  @Post('bulk/assign')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkAssign(@Body() dto: BulkAssignPoliciesDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.policy.findMany({ where: { id: { in: dto.ids } }, select: { id: true } });
    const { matched, skipped } = diffBulkIds(dto.ids, visible.map((p) => p.id));
    if (matched.length > 0) {
      await prisma.policy.updateMany({ where: { id: { in: matched } }, data: { brokerOfRecordId: dto.brokerOfRecordId } });
    }
    return { requested: dto.ids, updated: matched, skipped };
  }

  // Per-row loop (not a raw updateMany) — assertValidPolicyTransition must
  // still gate each row individually, same reasoning as
  // cases.controller.ts's bulkUpdate. Rows whose current status can't reach
  // the target land in `skipped` alongside RLS-invisible ids.
  @Post('bulk/update')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: BulkActionResponseDto })
  async bulkUpdate(@Body() dto: BulkUpdatePoliciesDto): Promise<BulkActionResponseDto> {
    const prisma = getPrismaClient();
    const visible = await prisma.policy.findMany({ where: { id: { in: dto.ids } }, select: { id: true, status: true } });
    const { matched, skipped: rlsSkipped } = diffBulkIds(dto.ids, visible.map((p) => p.id));
    const visibleById = new Map(visible.map((p) => [p.id, p]));
    const updated: string[] = [];
    const failed: string[] = [];
    for (const id of matched) {
      const policy = visibleById.get(id);
      if (!policy) continue;
      try {
        assertValidPolicyTransition(policy.status, dto.status);
        await prisma.policy.update({ where: { id }, data: { status: dto.status } });
        updated.push(id);
      } catch {
        failed.push(id);
      }
    }
    return { requested: dto.ids, updated, skipped: [...rlsSkipped, ...failed] };
  }

  @Get(':id')
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: PolicyResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PolicyResponseDto> {
    // Related version history / renewal schedule are their own resources
    // (GET .../versions, GET .../renewal-schedule) rather than embedded
    // here — keeps this response's shape stable regardless of how deep
    // those relations grow.
    const policy = await getPrismaClient().policy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException('Policy not found');
    return toPolicyDto(policy);
  }

  /** Who changed what, and when — see entity-history.ts's header comment for why this needs its own endpoint rather than reusing GET /audit-log. */
  @Get(':id/history')
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [AuditLogResponseDto] })
  async history(@Param('id', ParseUUIDPipe) id: string): Promise<AuditLogResponseDto[]> {
    const policy = await getPrismaClient().policy.findUnique({ where: { id }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');
    return loadEntityHistory('policies', id);
  }

  @Post()
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PolicyResponseDto })
  async create(@Body() dto: CreatePolicyDto): Promise<PolicyResponseDto> {
    const policy = await getPrismaClient().policy.create({
      data: {
        policyNumber: dto.policyNumber,
        accountId: dto.accountId,
        carrierId: dto.carrierId,
        lineOfBusiness: dto.lineOfBusiness,
        sumInsured: dto.sumInsured,
        currency: dto.currency ?? 'NGN',
        inceptionDate: new Date(dto.inceptionDate),
        expiryDate: new Date(dto.expiryDate),
        brokerOfRecordId: dto.brokerOfRecordId,
        // status intentionally omitted — schema default QUOTED. Reaching
        // ISSUED etc. happens via PolicyVersion creation (policy-version.controller.ts).
      },
    });
    return toPolicyDto(policy);
  }

  @Patch(':id')
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PolicyResponseDto })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePolicyDto): Promise<PolicyResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.policy.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Policy not found');

    if (dto.status) {
      assertValidPolicyTransition(existing.status, dto.status);
    }

    const policy = await prisma.policy.update({
      where: { id },
      data: {
        lineOfBusiness: dto.lineOfBusiness,
        sumInsured: dto.sumInsured,
        currency: dto.currency,
        inceptionDate: dto.inceptionDate ? new Date(dto.inceptionDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        brokerOfRecordId: dto.brokerOfRecordId,
        status: dto.status,
      },
    });
    return toPolicyDto(policy);
  }
}
