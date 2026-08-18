import { Controller, Get, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { getPrismaClient, type Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { BASE_CURRENCY, loadExchangeRates, toBaseCurrency } from '../dashboards/currency.util';
// NOT type-only: RenewalBoardQueryDto is a @Query() parameter type, so Nest
// needs it as a runtime VALUE to resolve the metatype ValidationPipe
// validates against. `eslint --fix` would happily split it into a type-only
// import and silently disable validation on every filter below — the exact
// footgun surveys.controller.ts documents.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  DEFAULT_RENEWAL_WINDOW_DAYS,
  RENEWABLE_POLICY_STATUSES,
  RenewalBoardQueryDto,
  RenewalBoardRowDto,
  RenewalBoardStatsDto,
} from './dto/renewal-board.dto';
import { renewalBoardToCsv } from './renewal-board-csv';

const MS_PER_DAY = 86_400_000;

/**
 * The org-wide renewal book.
 *
 * Renewals previously existed only one account at a time
 * (/crm/accounts/:id/renewals) or one policy at a time
 * (/policies/:policyId/renewal-schedule), plus a single forecast figure on a
 * dashboard. There was no way to ask "what is expiring across the whole book
 * in the next 90 days, who owns it, and what is it worth" — which for a
 * brokerage is the core retention workflow, not a reporting nicety.
 *
 * Gated on 'renewal_schedule':'read', the same resource the per-policy
 * endpoints already use, so no new permission has to be granted for an
 * existing renewals user to see the board.
 *
 * Row visibility rides on the existing RLS policies for policies/accounts —
 * a broker sees their own book, a manager sees their department's. The
 * aggregates below are computed over exactly the same filtered set, so the
 * header can never describe rows the table isn't showing.
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('renewals')
export class RenewalBoardController {
  @Get()
  @RequirePermission('renewal_schedule', 'read')
  @ApiOkResponse({ type: [RenewalBoardRowDto] })
  async list(@Query() query: RenewalBoardQueryDto): Promise<RenewalBoardRowDto[]> {
    const prisma = getPrismaClient();
    const take = query.take ?? 100;
    const skip = query.skip ?? 0;
    // Premium is a currency-normalized SUM over a child table, so Postgres
    // can't ORDER BY it here and paging must happen AFTER the sort. Ordering
    // a single already-paged slice would be actively misleading — the board
    // would claim to show the largest renewals while only ever ranking the
    // hundred that expire soonest. So that mode reads the whole filtered set
    // (hard-capped) and pages in memory; the default expiry ordering pages
    // in SQL as normal. The stats endpoint already scans the same set for
    // value-at-risk, so this is the cost profile this board already carries.
    const sortByPremium = query.sortBy === 'premium';
    const PREMIUM_SORT_SCAN_CAP = 5_000;

    const [policies, rates] = await Promise.all([
      prisma.policy.findMany({
        where: renewalBoardWhere(query),
        select: {
          id: true,
          policyNumber: true,
          accountId: true,
          lineOfBusiness: true,
          expiryDate: true,
          currency: true,
          account: { select: { name: true } },
          carrier: { select: { name: true } },
          brokerOfRecord: { select: { fullName: true } },
          renewalSchedule: {
            select: { status: true, renewalDueDate: true, assignedToId: true, assignedTo: { select: { fullName: true } } },
          },
          premiums: { select: { grossPremium: true } },
        },
        orderBy: { expiryDate: 'asc' },
        take: sortByPremium ? PREMIUM_SORT_SCAN_CAP : take,
        skip: sortByPremium ? 0 : skip,
      }),
      loadExchangeRates(),
    ]);

    const today = startOfToday();
    const rows = policies.map((p) => ({
      policyId: p.id,
      policyNumber: p.policyNumber,
      accountId: p.accountId,
      accountName: p.account.name,
      carrierName: p.carrier.name,
      lineOfBusiness: p.lineOfBusiness,
      expiryDate: p.expiryDate,
      daysToExpiry: Math.floor((startOfDay(p.expiryDate).getTime() - today.getTime()) / MS_PER_DAY),
      renewalStatus: p.renewalSchedule?.status ?? null,
      renewalDueDate: p.renewalSchedule?.renewalDueDate ?? null,
      assignedToId: p.renewalSchedule?.assignedToId ?? null,
      assignedToName: p.renewalSchedule?.assignedTo?.fullName ?? null,
      brokerOfRecordName: p.brokerOfRecord?.fullName ?? null,
      // Premium carries no currency of its own — it inherits the parent
      // policy's, so normalization has to use p.currency, not a global.
      annualPremiumBase: sumPremiumInBase(p.premiums, p.currency, rates),
      baseCurrency: BASE_CURRENCY,
      scheduleMissing: p.renewalSchedule === null,
    }));

    if (!sortByPremium) return rows;
    rows.sort((a, b) => b.annualPremiumBase - a.annualPremiumBase);
    return rows.slice(skip, skip + take);
  }

  /** Must precede nothing dynamic here, but kept adjacent to list() for the same filter contract. */
  @Get('count')
  @RequirePermission('renewal_schedule', 'read')
  @ApiOkResponse({ type: Number })
  async count(@Query() query: RenewalBoardQueryDto): Promise<{ count: number }> {
    const count = await getPrismaClient().policy.count({ where: renewalBoardWhere(query) });
    return { count };
  }

  @Get('stats')
  @RequirePermission('renewal_schedule', 'read')
  @ApiOkResponse({ type: RenewalBoardStatsDto })
  async stats(@Query() query: RenewalBoardQueryDto): Promise<RenewalBoardStatsDto> {
    const prisma = getPrismaClient();
    const where = renewalBoardWhere(query);
    const today = startOfToday();

    const windowEnd = (days: number) => new Date(today.getTime() + days * MS_PER_DAY);

    // AND, never a spread-and-override: `{ ...where, expiryDate: … }` would
    // REPLACE the window the caller already filtered on, so a "next 30 days"
    // view would report bucket counts drawn from outside its own filter.
    const and = (extra: Prisma.PolicyWhereInput): Prisma.PolicyWhereInput => ({ AND: [where, extra] });

    const [total, overdue, dueIn30, dueIn60, dueIn90, unassigned, atRisk, noSchedule, priced, rates] = await Promise.all([
      prisma.policy.count({ where }),
      prisma.policy.count({ where: and({ expiryDate: { lt: today } }) }),
      prisma.policy.count({ where: and({ expiryDate: { gte: today, lte: windowEnd(30) } }) }),
      prisma.policy.count({ where: and({ expiryDate: { gte: today, lte: windowEnd(60) } }) }),
      prisma.policy.count({ where: and({ expiryDate: { gte: today, lte: windowEnd(90) } }) }),
      // "Unassigned" covers both no schedule at all and a schedule with no
      // owner — from a manager's view both mean nobody is working it.
      prisma.policy.count({
        where: and({ OR: [{ renewalSchedule: null }, { renewalSchedule: { assignedToId: null } }] }),
      }),
      prisma.policy.count({ where: and({ renewalSchedule: { status: 'AT_RISK' } }) }),
      prisma.policy.count({ where: and({ renewalSchedule: null }) }),
      prisma.policy.findMany({ where, select: { currency: true, premiums: { select: { grossPremium: true } } } }),
      loadExchangeRates(),
    ]);

    const valueAtRisk = priced.reduce((sum, p) => sum + sumPremiumInBase(p.premiums, p.currency, rates), 0);

    return {
      total,
      overdue,
      dueIn30,
      dueIn60,
      dueIn90,
      unassigned,
      atRisk,
      noScheduleStarted: noSchedule,
      valueAtRisk: Math.round(valueAtRisk * 100) / 100,
      baseCurrency: BASE_CURRENCY,
    };
  }

  @Get('export')
  @RequirePermission('renewal_schedule', 'read')
  async export(@Query() query: RenewalBoardQueryDto, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    // Ignores `take` and caps at 10,000 — an export that silently stopped at
    // the table's page size is a truncation bug this codebase has hit before.
    const rows = await this.list({ ...query, take: 10_000, skip: 0 });
    const csv = renewalBoardToCsv(rows);
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="renewals.csv"' });
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }
}

/** Local midnight — renewal windows are calendar-day questions, not instants. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sumPremiumInBase(premiums: { grossPremium: Prisma.Decimal }[], currency: string, rates: Map<string, number>): number {
  const gross = premiums.reduce((sum, pr) => sum + Number(pr.grossPremium), 0);
  return toBaseCurrency(gross, currency, rates);
}

/**
 * Shared by list/count/stats/export so every number on the page describes
 * the same population.
 *
 * Two deliberate choices. Only RENEWABLE_POLICY_STATUSES appear — a
 * cancelled or already-renewed policy is not a retention opportunity.
 * And already-expired policies are ALWAYS included regardless of the
 * `withinDays` window: a policy that lapsed unnoticed last month is the most
 * urgent thing on the board, and a "next 90 days" filter that hid it would
 * defeat the purpose of the board existing.
 */
function renewalBoardWhere(query: RenewalBoardQueryDto): Prisma.PolicyWhereInput {
  const today = startOfToday();
  const windowEnd = new Date(today.getTime() + (query.withinDays ?? DEFAULT_RENEWAL_WINDOW_DAYS) * MS_PER_DAY);

  return {
    status: { in: [...RENEWABLE_POLICY_STATUSES] },
    expiryDate: { lte: windowEnd },
    accountId: query.accountId,
    carrierId: query.carrierId,
    lineOfBusiness: query.lineOfBusiness,
    brokerOfRecordId: query.brokerOfRecordId,
    policyNumber: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
    ...(query.renewalStatus ? { renewalSchedule: { status: query.renewalStatus } } : {}),
    ...(query.assignedToId ? { renewalSchedule: { assignedToId: query.assignedToId } } : {}),
    ...(query.unassignedOnly === 'true'
      ? { OR: [{ renewalSchedule: null }, { renewalSchedule: { assignedToId: null } }] }
      : {}),
  };
}
