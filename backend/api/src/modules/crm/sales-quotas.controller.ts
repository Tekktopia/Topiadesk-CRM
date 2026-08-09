import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import {
  CreateSalesQuotaDto,
  QuotaAttainmentResponseDto,
  SalesQuotaQueryDto,
  SalesQuotaResponseDto,
  UpdateSalesQuotaDto,
} from './dto/sales-quota.dto';
import { toSalesQuotaDto } from './mapping';

/**
 * sales_quotas_rw's WITH CHECK (prisma/rls/002_policies.sql) requires
 * SYSTEM_JOB or an ALL-scope 'sales_quota':'write' grant — quotas are
 * assigned BY a manager/admin TO a rep, never self-service, and no
 * non-admin role has that grant seeded, so writes here are effectively
 * admin-only regardless of which resource string gates the NestJS guard.
 * Gating write on 'sales_quota' (the exact resource the RLS policy itself
 * checks) turns that into a clean 403 for everyone else instead of a
 * confusing RLS insert failure. Reads reuse 'opportunity' (no dedicated
 * 'sales_quota' read grant is seeded for non-admin roles either) so a
 * broker can see their own attainment — sales_quotas_rw's USING clause
 * (user_id = self) already restricts *which* quota rows they get back.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/sales-quotas')
export class SalesQuotasController {
  @Get()
  @RequirePermission('opportunity', 'read')
  @ApiOkResponse({ type: [SalesQuotaResponseDto] })
  async list(@Query() query: SalesQuotaQueryDto): Promise<SalesQuotaResponseDto[]> {
    const quotas = await getPrismaClient().salesQuota.findMany({
      where: { scopeType: query.scopeType, userId: query.userId },
      orderBy: { periodStart: 'desc' },
    });
    return quotas.map(toSalesQuotaDto);
  }

  @Get(':id')
  @RequirePermission('opportunity', 'read')
  @ApiOkResponse({ type: SalesQuotaResponseDto })
  async getOne(@Param('id') id: string): Promise<SalesQuotaResponseDto> {
    const quota = await getPrismaClient().salesQuota.findUnique({ where: { id } });
    if (!quota) throw new NotFoundException('SalesQuota not found');
    return toSalesQuotaDto(quota);
  }

  @Post()
  @RequirePermission('sales_quota', 'write')
  @ApiOkResponse({ type: SalesQuotaResponseDto })
  async create(@Body() dto: CreateSalesQuotaDto): Promise<SalesQuotaResponseDto> {
    assertScopeTargetConsistent(dto.scopeType, dto.userId, dto.departmentId, dto.branchId);
    const quota = await getPrismaClient().salesQuota.create({
      data: {
        scopeType: dto.scopeType,
        userId: dto.userId,
        departmentId: dto.departmentId,
        branchId: dto.branchId,
        periodType: dto.periodType,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        targetAmount: dto.targetAmount,
        lineOfBusiness: dto.lineOfBusiness,
      },
    });
    return toSalesQuotaDto(quota);
  }

  @Patch(':id')
  @RequirePermission('sales_quota', 'write')
  @ApiOkResponse({ type: SalesQuotaResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateSalesQuotaDto): Promise<SalesQuotaResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.salesQuota.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('SalesQuota not found');

    const nextScopeType = dto.scopeType ?? existing.scopeType;
    const nextUserId = dto.userId !== undefined ? dto.userId : existing.userId;
    const nextDepartmentId = dto.departmentId !== undefined ? dto.departmentId : existing.departmentId;
    const nextBranchId = dto.branchId !== undefined ? dto.branchId : existing.branchId;
    assertScopeTargetConsistent(nextScopeType, nextUserId ?? undefined, nextDepartmentId ?? undefined, nextBranchId ?? undefined);

    const quota = await prisma.salesQuota.update({
      where: { id },
      data: {
        scopeType: dto.scopeType,
        userId: dto.userId,
        departmentId: dto.departmentId,
        branchId: dto.branchId,
        periodType: dto.periodType,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : undefined,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : undefined,
        targetAmount: dto.targetAmount,
        lineOfBusiness: dto.lineOfBusiness,
      },
    });
    return toSalesQuotaDto(quota);
  }

  @Delete(':id')
  @RequirePermission('sales_quota', 'write')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    const prisma = getPrismaClient();
    const existing = await prisma.salesQuota.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('SalesQuota not found');
    await prisma.salesQuota.delete({ where: { id } });
  }

  @Get(':id/attainment')
  @RequirePermission('opportunity', 'read')
  @ApiOkResponse({ type: QuotaAttainmentResponseDto })
  async getAttainment(@Param('id') id: string): Promise<QuotaAttainmentResponseDto> {
    const prisma = getPrismaClient();
    const quota = await prisma.salesQuota.findUnique({ where: { id } });
    if (!quota) throw new NotFoundException('SalesQuota not found');

    const ownerFilter: Prisma.OpportunityWhereInput =
      quota.scopeType === 'USER'
        ? { ownerId: quota.userId! }
        : quota.scopeType === 'DEPARTMENT'
          ? { owner: { departmentId: quota.departmentId! } }
          : quota.scopeType === 'BRANCH'
            ? { owner: { branchId: quota.branchId! } }
            : {};

    const wonOpportunities = await prisma.opportunity.findMany({
      where: {
        ...ownerFilter,
        lineOfBusiness: quota.lineOfBusiness ?? undefined,
        actualCloseDate: { gte: quota.periodStart, lte: quota.periodEnd },
        pipelineStage: { isWon: true },
      },
      select: { amount: true },
    });

    const wonAmount = wonOpportunities.reduce((sum, o) => sum + Number(o.amount), 0);
    const targetAmount = Number(quota.targetAmount);
    const attainmentPct = targetAmount > 0 ? Math.round((wonAmount / targetAmount) * 10000) / 100 : 0;

    return { targetAmount: targetAmount.toFixed(2), wonAmount: wonAmount.toFixed(2), attainmentPct };
  }
}

function assertScopeTargetConsistent(
  scopeType: 'USER' | 'DEPARTMENT' | 'BRANCH' | 'ORG',
  userId?: string,
  departmentId?: string,
  branchId?: string,
): void {
  const setCount = [userId, departmentId, branchId].filter((v) => v !== undefined && v !== null).length;
  if (scopeType === 'USER' && !(setCount === 1 && userId)) {
    throw new BadRequestException('scopeType=USER requires exactly userId to be set');
  }
  if (scopeType === 'DEPARTMENT' && !(setCount === 1 && departmentId)) {
    throw new BadRequestException('scopeType=DEPARTMENT requires exactly departmentId to be set');
  }
  if (scopeType === 'BRANCH' && !(setCount === 1 && branchId)) {
    throw new BadRequestException('scopeType=BRANCH requires exactly branchId to be set');
  }
  if (scopeType === 'ORG' && setCount !== 0) {
    throw new BadRequestException('scopeType=ORG requires userId/departmentId/branchId to all be unset');
  }
}
