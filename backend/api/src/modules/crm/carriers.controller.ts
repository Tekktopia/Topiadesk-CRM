import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import {
  CarrierMarketSubmissionRowDto,
  CarrierPolicyRowDto,
  CarrierQueryDto,
  CarrierResponseDto,
  CarrierScorecardDto,
  CarrierStatsResponseDto,
  CreateCarrierDto,
  UpdateCarrierDto,
} from './dto/carrier.dto';
import { decimalToString } from '../policy/decimal.util';
import { carriersToCsv } from './carrier-csv';
import { BASE_CURRENCY, loadExchangeRates, toBaseCurrency } from '../dashboards/currency.util';

/**
 * carriers has no RLS policy (prisma/rls/001_enable_rls.sql deliberately
 * omits it — supply-side reference data, open to any authenticated staff
 * member per docs/architecture.md). Reads are therefore ungated here
 * (authentication alone suffices); writes are gated on the dedicated
 * 'carrier' resource (packages/db/prisma/seed.ts) rather than reusing
 * 'account' as this controller previously did.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/carriers')
export class CarriersController {
  @Get()
  @ApiOkResponse({ type: [CarrierResponseDto] })
  async list(@Query() query: CarrierQueryDto): Promise<CarrierResponseDto[]> {
    return getPrismaClient().carrier.findMany({
      where: carrierListWhere(query),
      orderBy: { name: 'asc' },
      take: query.take ?? 100,
      skip: query.skip ?? 0,
    });
  }

  // Must precede ':id' — Nest matches literal segments in declaration order
  // ahead of a dynamic param competing for the same position.
  @Get('count')
  @ApiOkResponse({ type: Number })
  async count(@Query() query: CarrierQueryDto): Promise<{ count: number }> {
    const count = await getPrismaClient().carrier.count({ where: carrierListWhere(query) });
    return { count };
  }

  /**
   * Panel-level aggregates — see CarrierStatsResponseDto for how this
   * differs from the per-carrier :id/scorecard.
   */
  @Get('stats')
  @ApiOkResponse({ type: CarrierStatsResponseDto })
  async stats(@Query() query: CarrierQueryDto): Promise<CarrierStatsResponseDto> {
    const prisma = getPrismaClient();
    const where = carrierListWhere(query);

    const [total, activeOnPanel, prospective, offPanel, matching, exchangeRates] = await Promise.all([
      prisma.carrier.count({ where }),
      prisma.carrier.count({ where: { AND: [where, { panelStatus: 'ACTIVE' }] } }),
      prisma.carrier.count({ where: { AND: [where, { panelStatus: 'PROSPECTIVE' }] } }),
      prisma.carrier.count({ where: { AND: [where, { panelStatus: { in: ['SUSPENDED', 'TERMINATED'] } }] } }),
      prisma.carrier.findMany({ where, select: { id: true } }),
      loadExchangeRates(),
    ]);

    const carrierIds = matching.map((c) => c.id);
    // Premium has no currency column of its own — it inherits the parent
    // Policy's, so the policy's currency has to come back with each row to
    // normalize before summing.
    const [policiesPlaced, premiums] = await Promise.all([
      carrierIds.length === 0 ? Promise.resolve(0) : prisma.policy.count({ where: { carrierId: { in: carrierIds } } }),
      carrierIds.length === 0
        ? Promise.resolve([])
        : prisma.premium.findMany({
            where: { policy: { carrierId: { in: carrierIds } } },
            select: { grossPremium: true, policy: { select: { currency: true } } },
          }),
    ]);

    const totalGrossPremium = premiums.reduce(
      (sum, p) => sum + toBaseCurrency(Number(p.grossPremium), p.policy.currency, exchangeRates),
      0,
    );

    return {
      total,
      activeOnPanel,
      prospective,
      offPanel,
      policiesPlaced,
      baseCurrency: BASE_CURRENCY,
      totalGrossPremium: Math.round(totalGrossPremium * 100) / 100,
    };
  }

  @Get('export')
  async export(@Query() query: CarrierQueryDto, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const carriers = await getPrismaClient().carrier.findMany({
      where: carrierListWhere(query),
      orderBy: { name: 'asc' },
      take: 10_000,
    });
    const csv = carriersToCsv(carriers);
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="carriers.csv"' });
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  @Get(':id')
  @ApiOkResponse({ type: CarrierResponseDto })
  async getOne(@Param('id') id: string): Promise<CarrierResponseDto> {
    const carrier = await getPrismaClient().carrier.findUnique({ where: { id } });
    if (!carrier) throw new NotFoundException('Carrier not found');
    return carrier;
  }

  // Book-of-business roll-up — previously invisible at the carrier level
  // despite Policy.carrierId already tracking every policy written with
  // this market. Mirrors AccountsController.getOne()'s financials aggregate
  // (accounts.controller.ts) but kept as its own endpoint rather than
  // folded into getOne(): a carrier's book can be hundreds of policies,
  // and the list view (GET /crm/carriers) never needs it.
  @Get(':id/policies')
  @ApiOkResponse({ type: [CarrierPolicyRowDto] })
  async listPolicies(@Param('id') id: string): Promise<CarrierPolicyRowDto[]> {
    const policies = await getPrismaClient().policy.findMany({
      where: { carrierId: id },
      select: {
        id: true,
        policyNumber: true,
        accountId: true,
        account: { select: { name: true } },
        lineOfBusiness: true,
        status: true,
        sumInsured: true,
        currency: true,
        expiryDate: true,
      },
      orderBy: { expiryDate: 'desc' },
    });
    return policies.map((p) => ({
      id: p.id,
      policyNumber: p.policyNumber,
      accountId: p.accountId,
      accountName: p.account.name,
      lineOfBusiness: p.lineOfBusiness,
      status: p.status,
      sumInsured: decimalToString(p.sumInsured),
      currency: p.currency,
      expiryDate: p.expiryDate,
    }));
  }

  // First real consumer of OpportunityMarketSubmission — the model already
  // tracks every carrier a broker shops an opportunity to (quotedPremium/
  // status/submittedAt/respondedAt), but nothing renders it anywhere today.
  @Get(':id/market-submissions')
  @ApiOkResponse({ type: [CarrierMarketSubmissionRowDto] })
  async listMarketSubmissions(@Param('id') id: string): Promise<CarrierMarketSubmissionRowDto[]> {
    const submissions = await getPrismaClient().opportunityMarketSubmission.findMany({
      where: { carrierId: id },
      select: {
        id: true,
        opportunityId: true,
        opportunity: { select: { name: true } },
        quotedPremium: true,
        status: true,
        submittedAt: true,
        respondedAt: true,
      },
      orderBy: { submittedAt: 'desc' },
    });
    return submissions.map((s) => ({
      id: s.id,
      opportunityId: s.opportunityId,
      opportunityName: s.opportunity.name,
      quotedPremium: decimalToString(s.quotedPremium),
      status: s.status,
      submittedAt: s.submittedAt,
      respondedAt: s.respondedAt,
    }));
  }

  // Computed on the fly, never stored — same reasoning as every other
  // report-style endpoint in this codebase (reports.controller.ts's header
  // comment). Ratios are null (not 0) when there's nothing to divide by, so
  // the frontend renders "—" rather than a misleading 0%.
  @Get(':id/scorecard')
  @ApiOkResponse({ type: CarrierScorecardDto })
  async getScorecard(@Param('id') id: string): Promise<CarrierScorecardDto> {
    const prisma = getPrismaClient();
    const [submissions, premiumAgg, claimAgg] = await Promise.all([
      prisma.opportunityMarketSubmission.findMany({
        where: { carrierId: id },
        select: { status: true, submittedAt: true, respondedAt: true },
      }),
      prisma.premium.aggregate({ where: { policy: { carrierId: id } }, _sum: { grossPremium: true } }),
      prisma.claim.aggregate({ where: { policy: { carrierId: id } }, _sum: { settledAmount: true } }),
    ]);

    const totalSubmissions = submissions.length;
    const totalBound = submissions.filter((s) => s.status === 'BOUND').length;
    const bindRatio = totalSubmissions > 0 ? totalBound / totalSubmissions : null;

    const responded = submissions.filter((s) => s.respondedAt !== null);
    const avgResponseDays =
      responded.length > 0
        ? responded.reduce((sum, s) => sum + (s.respondedAt!.getTime() - s.submittedAt.getTime()) / 86_400_000, 0) / responded.length
        : null;

    const totalGrossPremium = premiumAgg._sum.grossPremium;
    const totalSettledClaims = claimAgg._sum.settledAmount;
    const lossRatio = totalGrossPremium && totalGrossPremium.greaterThan(0) && totalSettledClaims
      ? totalSettledClaims.dividedBy(totalGrossPremium).toNumber()
      : null;

    return {
      totalSubmissions,
      totalBound,
      bindRatio,
      avgResponseDays,
      totalGrossPremium: decimalToString(totalGrossPremium),
      totalSettledClaims: decimalToString(totalSettledClaims),
      lossRatio,
    };
  }

  @Post()
  @RequirePermission('carrier', 'write')
  @ApiOkResponse({ type: CarrierResponseDto })
  async create(@Body() dto: CreateCarrierDto): Promise<CarrierResponseDto> {
    return getPrismaClient().carrier.create({ data: { ...dto, linesOfBusiness: dto.linesOfBusiness ?? [] } });
  }

  @Patch(':id')
  @RequirePermission('carrier', 'write')
  @ApiOkResponse({ type: CarrierResponseDto })
  async update(@Param('id') id: string, @Body() dto: UpdateCarrierDto): Promise<CarrierResponseDto> {
    const prisma = getPrismaClient();
    const existing = await prisma.carrier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Carrier not found');
    return prisma.carrier.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermission('carrier', 'write')
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    const prisma = getPrismaClient();
    const existing = await prisma.carrier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Carrier not found');
    await prisma.carrier.delete({ where: { id } });
    return { deleted: true };
  }
}

/**
 * Shared by list/count/stats/export so the four never disagree — same
 * contract as accountListWhere()/leadListWhere()/opportunityListWhere().
 *
 * `linesOfBusiness` is a String[]; `has` is an exact element match, which is
 * what the picker on the page supplies (it is populated from the distinct
 * values already stored), so no partial matching is wanted here.
 */
function carrierListWhere(query: CarrierQueryDto): Prisma.CarrierWhereInput {
  const q = query.q?.trim();
  return {
    carrierType: query.carrierType,
    panelStatus: query.panelStatus,
    linesOfBusiness: query.lineOfBusiness ? { has: query.lineOfBusiness } : undefined,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { amBestRating: { contains: q, mode: 'insensitive' as const } },
            { treatyType: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}
