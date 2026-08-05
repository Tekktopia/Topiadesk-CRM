import { Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, Prisma } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { EnrollLoyaltyAccountDto, LoyaltyAccountResponseDto, UpdateLoyaltyTierDto } from './dto/loyalty-account.dto';
import { AdjustPointsDto, EarnPointsDto, LoyaltyTransactionResponseDto, RedeemPointsDto } from './dto/loyalty-transaction.dto';
import { postLoyaltyTransaction } from './loyalty-ledger.util';
import { queryRawWithRlsContext } from './rls-raw-query.util';

interface LoyaltyAccountRow {
  id: string;
  account_id: string;
  account_name: string;
  tier: string;
  points_balance: bigint;
  enrolled_at: Date;
  created_at: Date;
  updated_at: Date;
}

function toResponse(row: LoyaltyAccountRow): LoyaltyAccountResponseDto {
  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    tier: row.tier,
    pointsBalance: Number(row.points_balance),
    enrolledAt: row.enrolled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The points balance is never a stored column (see LoyaltyAccount's schema
 * comment) — every read here computes it via a LEFT JOIN LATERAL SUM
 * against loyalty_transactions, scoped by the same RLS policies as any
 * other query (queryRawWithRlsContext applies the caller's session vars
 * before this runs, so a broker only ever sees accounts RLS already lets
 * them see — the SQL below adds no additional filtering of its own).
 */
const BALANCE_SELECT = Prisma.sql`
  SELECT la.id, la.account_id, a.name AS account_name, la.tier,
         COALESCE(bal.points_balance, 0) AS points_balance,
         la.enrolled_at, la.created_at, la.updated_at
  FROM loyalty_accounts la
  JOIN accounts a ON a.id = la.account_id
  LEFT JOIN LATERAL (
    SELECT SUM(points) AS points_balance FROM loyalty_transactions lt WHERE lt.loyalty_account_id = la.id
  ) bal ON true
`;

@ApiTags('loyalty')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('loyalty-accounts')
export class LoyaltyAccountsController {
  @Get()
  @RequirePermission('loyalty', 'read')
  @ApiOkResponse({ type: [LoyaltyAccountResponseDto] })
  async list(@Query('search') search?: string): Promise<LoyaltyAccountResponseDto[]> {
    const rows = search
      ? await queryRawWithRlsContext<LoyaltyAccountRow>(
          Prisma.sql`${BALANCE_SELECT} WHERE a.name ILIKE ${`%${search}%`} ORDER BY a.name ASC LIMIT 200`,
        )
      : await queryRawWithRlsContext<LoyaltyAccountRow>(Prisma.sql`${BALANCE_SELECT} ORDER BY a.name ASC LIMIT 200`);
    return rows.map(toResponse);
  }

  @Get('by-account/:accountId')
  @RequirePermission('loyalty', 'read')
  @ApiOkResponse({ type: LoyaltyAccountResponseDto })
  async findByAccount(@Param('accountId') accountId: string): Promise<LoyaltyAccountResponseDto | null> {
    const rows = await queryRawWithRlsContext<LoyaltyAccountRow>(Prisma.sql`${BALANCE_SELECT} WHERE la.account_id = ${accountId}::uuid`);
    return rows[0] ? toResponse(rows[0]) : null;
  }

  @Get(':id')
  @RequirePermission('loyalty', 'read')
  @ApiOkResponse({ type: LoyaltyAccountResponseDto })
  async findOne(@Param('id') id: string): Promise<LoyaltyAccountResponseDto> {
    const rows = await queryRawWithRlsContext<LoyaltyAccountRow>(Prisma.sql`${BALANCE_SELECT} WHERE la.id = ${id}::uuid`);
    if (!rows[0]) throw new NotFoundException('Loyalty account not found');
    return toResponse(rows[0]);
  }

  @Get(':id/transactions')
  @RequirePermission('loyalty', 'read')
  @ApiOkResponse({ type: [LoyaltyTransactionResponseDto] })
  async transactions(@Param('id') id: string): Promise<LoyaltyTransactionResponseDto[]> {
    // getPrismaClient() (not the raw-query helper) is fine here — this is a
    // single model-delegate read, which the normal RLS-wrapping Proxy
    // already covers; the raw-query helper only exists for the cases the
    // Proxy can't reach (aggregates/locks/plain SQL functions).
    const rows = await getPrismaClient().loyaltyTransaction.findMany({
      where: { loyaltyAccountId: id },
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      loyaltyAccountId: r.loyaltyAccountId,
      type: r.type,
      points: r.points,
      reason: r.reason,
      relatedPolicyId: r.relatedPolicyId,
      createdById: r.createdById,
      createdByName: r.createdBy?.fullName ?? null,
      createdAt: r.createdAt,
    }));
  }

  @Post()
  @RequirePermission('loyalty', 'write')
  @ApiOkResponse({ type: LoyaltyAccountResponseDto })
  async enroll(@Body() dto: EnrollLoyaltyAccountDto): Promise<LoyaltyAccountResponseDto> {
    try {
      const created = await getPrismaClient().loyaltyAccount.create({
        data: { accountId: dto.accountId, tier: dto.tier ?? 'STANDARD' },
      });
      const rows = await queryRawWithRlsContext<LoyaltyAccountRow>(Prisma.sql`${BALANCE_SELECT} WHERE la.id = ${created.id}::uuid`);
      return toResponse(rows[0]!);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictException('This account is already enrolled in the loyalty program');
      }
      throw err;
    }
  }

  @Patch(':id/tier')
  @RequirePermission('loyalty', 'write')
  @ApiOkResponse({ type: LoyaltyAccountResponseDto })
  async updateTier(@Param('id') id: string, @Body() dto: UpdateLoyaltyTierDto): Promise<LoyaltyAccountResponseDto> {
    await getPrismaClient().loyaltyAccount.update({ where: { id }, data: { tier: dto.tier } });
    const rows = await queryRawWithRlsContext<LoyaltyAccountRow>(Prisma.sql`${BALANCE_SELECT} WHERE la.id = ${id}::uuid`);
    return toResponse(rows[0]!);
  }

  @Post(':id/earn')
  @RequirePermission('loyalty', 'write')
  @ApiOkResponse({ type: LoyaltyTransactionResponseDto })
  async earn(@Param('id') id: string, @Body() dto: EarnPointsDto, @CurrentUser() user: AuthenticatedUser): Promise<LoyaltyTransactionResponseDto> {
    const txn = await postLoyaltyTransaction({
      loyaltyAccountId: id,
      type: 'EARN',
      points: Math.abs(dto.points),
      reason: dto.reason,
      relatedPolicyId: dto.relatedPolicyId,
      createdById: user.id,
    });
    return { ...txn, createdByName: user.fullName };
  }

  @Post(':id/redeem')
  @RequirePermission('loyalty', 'write')
  @ApiOkResponse({ type: LoyaltyTransactionResponseDto })
  async redeem(@Param('id') id: string, @Body() dto: RedeemPointsDto, @CurrentUser() user: AuthenticatedUser): Promise<LoyaltyTransactionResponseDto> {
    const txn = await postLoyaltyTransaction({
      loyaltyAccountId: id,
      type: 'REDEEM',
      points: -Math.abs(dto.points),
      reason: dto.reason,
      createdById: user.id,
    });
    return { ...txn, createdByName: user.fullName };
  }

  @Post(':id/adjust')
  @RequirePermission('loyalty', 'write')
  @ApiOkResponse({ type: LoyaltyTransactionResponseDto })
  async adjust(@Param('id') id: string, @Body() dto: AdjustPointsDto, @CurrentUser() user: AuthenticatedUser): Promise<LoyaltyTransactionResponseDto> {
    const txn = await postLoyaltyTransaction({
      loyaltyAccountId: id,
      type: 'ADJUST',
      points: dto.points,
      reason: dto.reason,
      createdById: user.id,
    });
    return { ...txn, createdByName: user.fullName };
  }
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'P2002';
}
