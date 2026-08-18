import { Controller, Get, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { BASE_CURRENCY, loadExchangeRates, toBaseCurrency } from '../dashboards/currency.util';
import { crossSellToCsv } from './cross-sell-csv';
// NOT type-only: CrossSellQueryDto is a @Query() parameter type — Nest needs
// it as a runtime value for ValidationPipe to resolve the metatype.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  CrossSellLineDto,
  CrossSellQueryDto,
  CrossSellRowDto,
  CrossSellStatsDto,
  HELD_POLICY_STATUSES,
} from './dto/cross-sell.dto';

/**
 * Cross-sell whitespace — which clients hold which lines of business, and
 * which they don't.
 *
 * Nothing in the system could answer "who has Motor but not Liability",
 * despite it being the most direct revenue lever a brokerage CRM offers.
 *
 * The universe of sellable lines comes from the CARRIER PANEL union whatever
 * has already been written, not from placed policies alone. That distinction
 * matters: a line the firm has never sold to anyone is exactly the whitespace
 * worth seeing, and deriving the universe from placed business alone would
 * make it invisible by construction. Conversely a line nobody can place is
 * not an opportunity, so the panel bounds it.
 *
 * Gated on 'account':'read' — this is a view over the client book, and
 * anyone who can see accounts can see which cover they hold. RLS on accounts
 * and policies still scopes rows per user, so a broker sees their own book.
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/cross-sell')
export class CrossSellController {
  @Get()
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [CrossSellRowDto] })
  async list(@Query() query: CrossSellQueryDto): Promise<CrossSellRowDto[]> {
    const { rows } = await this.build(query);
    return rows;
  }

  @Get('stats')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: CrossSellStatsDto })
  async stats(@Query() query: CrossSellQueryDto): Promise<CrossSellStatsDto> {
    const { rows, universe } = await this.build(query);

    const lines: CrossSellLineDto[] = [...universe]
      .map((line) => {
        const holding = rows.filter((r) => r.linesHeld.includes(line)).length;
        return { line, accountsHolding: holding, accountsMissing: rows.length - holding };
      })
      .sort((a, b) => b.accountsMissing - a.accountsMissing);

    const withCover = rows.filter((r) => r.policyCount > 0);
    const totalLinesHeld = withCover.reduce((sum, r) => sum + r.linesHeld.length, 0);
    const biggest = lines[0];

    return {
      accounts: rows.length,
      accountsWithCover: withCover.length,
      accountsWithGaps: rows.filter((r) => r.linesMissing.length > 0).length,
      linesAvailable: universe.size,
      averageLinesPerAccount: withCover.length === 0 ? 0 : Math.round((totalLinesHeld / withCover.length) * 10) / 10,
      biggestGapLine: biggest?.line ?? null,
      biggestGapCount: biggest?.accountsMissing ?? 0,
      lines,
    };
  }

  @Get('export')
  @RequirePermission('account', 'read')
  async export(@Query() query: CrossSellQueryDto, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    // Caps at 10,000 rather than honouring `take` — an export that stopped at
    // the table's page size is a truncation bug this codebase has hit before.
    const { rows } = await this.build({ ...query, take: 10_000 });
    const csv = crossSellToCsv(rows);
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="cross-sell.csv"' });
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  /**
   * One pass shared by list/stats/export so the header, the table and the
   * download can never describe different populations.
   *
   * Held lines are computed in JS rather than SQL because the whitespace is a
   * SET DIFFERENCE against a universe that itself has to be assembled from
   * two sources; expressing that as a single query would be less legible for
   * no gain at the row counts a broking book reaches.
   */
  private async build(query: CrossSellQueryDto): Promise<{ rows: CrossSellRowDto[]; universe: Set<string> }> {
    const prisma = getPrismaClient();
    const take = query.take ?? 200;

    const [accounts, carriers, rates] = await Promise.all([
      prisma.account.findMany({
        where: {
          isArchived: false,
          status: query.status,
          ownerId: query.ownerId,
        },
        select: {
          id: true,
          name: true,
          status: true,
          owner: { select: { fullName: true } },
          policies: {
            where: { status: { in: [...HELD_POLICY_STATUSES] } },
            select: { lineOfBusiness: true, currency: true, premiums: { select: { grossPremium: true } } },
          },
        },
        orderBy: { name: 'asc' },
        take,
      }),
      prisma.carrier.findMany({ select: { linesOfBusiness: true } }),
      loadExchangeRates(),
    ]);

    // The sellable universe: everything the panel can place, plus anything
    // already written (a line placed before a carrier was retired is still a
    // line these clients hold, and dropping it would report a false gap).
    const universe = new Set<string>();
    for (const c of carriers) for (const l of c.linesOfBusiness) universe.add(l);
    for (const a of accounts) for (const p of a.policies) universe.add(p.lineOfBusiness);

    let rows: CrossSellRowDto[] = accounts.map((a) => {
      const held = [...new Set(a.policies.map((p) => p.lineOfBusiness))].sort();
      const premiumBase = a.policies.reduce(
        (sum, p) => sum + toBaseCurrency(p.premiums.reduce((s, pr) => s + Number(pr.grossPremium), 0), p.currency, rates),
        0,
      );
      return {
        accountId: a.id,
        accountName: a.name,
        status: a.status,
        ownerName: a.owner?.fullName ?? null,
        linesHeld: held,
        linesMissing: [...universe].filter((l) => !held.includes(l)).sort(),
        policyCount: a.policies.length,
        premiumBase: Math.round(premiumBase * 100) / 100,
        baseCurrency: BASE_CURRENCY,
      };
    });

    // Line filters apply AFTER the universe is known — they are questions
    // about the computed whitespace, not about stored columns.
    if (query.missingLine) rows = rows.filter((r) => r.linesMissing.includes(query.missingLine!));
    if (query.holdsLine) rows = rows.filter((r) => r.linesHeld.includes(query.holdsLine!));
    if (query.minLinesHeld !== undefined) rows = rows.filter((r) => r.linesHeld.length >= query.minLinesHeld!);

    return { rows, universe };
  }
}

/** Kept for symmetry with the other controllers' where-builders. */
export type CrossSellAccountWhere = Prisma.AccountWhereInput;
