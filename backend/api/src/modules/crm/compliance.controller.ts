import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, type Account } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { ComplianceSummaryResponseDto, KycAccountRowDto, KycDashboardQueryDto, type KycUrgency } from './dto/compliance.dto';

const KYC_EXPIRING_SOON_DAYS = 30;
const KYC_ATTENTION_STATUSES = ['NOT_STARTED', 'PENDING', 'EXPIRED', 'REJECTED'] as const;

function kycUrgency(account: Pick<Account, 'kycStatus' | 'kycExpiryDate'>, now: Date): KycUrgency {
  if (account.kycStatus === 'EXPIRED' || (account.kycExpiryDate && account.kycExpiryDate < now)) return 'EXPIRED';
  if (account.kycStatus !== 'VERIFIED') return 'NOT_VERIFIED';
  return 'EXPIRING_SOON';
}

/**
 * Summary/aggregation surface for the new /compliance dashboard —
 * everything here is READ-only counts or a filtered account list; the
 * actual compliance WORKFLOWS (fulfilling a DSR, recording consent,
 * verifying KYC, reviewing the audit chain) stay on the pages that already
 * own them (DataSubjectRequestsController, ConsentRecordsController,
 * AccountsController's KYC verify action, AuditExportController) — this
 * just aggregates counts/rows from across those so a compliance officer
 * has one landing page instead of hunting through CRM/Admin menus for each
 * one separately (the gap this whole /compliance section closes).
 */
@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('crm/compliance')
export class ComplianceController {
  @Get('summary')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: ComplianceSummaryResponseDto })
  async summary(): Promise<ComplianceSummaryResponseDto> {
    const prisma = getPrismaClient();
    const now = new Date();
    const expiringThreshold = new Date(now.getTime() + KYC_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [openDsrCount, kycExpiringCount, kycAttentionCount, consentRecordsThisWeek, latestCheckpoint] = await Promise.all([
      prisma.dataSubjectRequest.count({ where: { status: 'PENDING' } }),
      prisma.account.count({ where: { kycStatus: 'VERIFIED', kycExpiryDate: { gte: now, lte: expiringThreshold } } }),
      prisma.account.count({ where: { kycStatus: { in: [...KYC_ATTENTION_STATUSES] } } }),
      prisma.consentRecord.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.auditCheckpoint.findFirst({ orderBy: { checkpointAt: 'desc' }, select: { checkpointAt: true } }),
    ]);

    return { openDsrCount, kycExpiringCount, kycAttentionCount, consentRecordsThisWeek, latestCheckpointAt: latestCheckpoint?.checkpointAt ?? null };
  }

  /**
   * Accounts needing KYC attention — expired, not yet verified, or
   * verified but expiring within KYC_EXPIRING_SOON_DAYS — worst-first
   * (EXPIRED, then NOT_VERIFIED, then EXPIRING_SOON), soonest-expiry first
   * within each bucket. A plain `GET /crm/accounts?kycStatus=` filter
   * exists for a single exact status but can't express "expiring soon"
   * (a date-range, not a status) or combine multiple statuses in one
   * call — this is the purpose-built version for exactly that.
   */
  @Get('kyc')
  @RequirePermission('account', 'read')
  @ApiOkResponse({ type: [KycAccountRowDto] })
  async kyc(@Query() query: KycDashboardQueryDto): Promise<KycAccountRowDto[]> {
    const prisma = getPrismaClient();
    const now = new Date();
    const expiringThreshold = new Date(now.getTime() + KYC_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

    const accounts = await prisma.account.findMany({
      where: {
        OR: [
          { kycStatus: { in: [...KYC_ATTENTION_STATUSES] } },
          { kycStatus: 'VERIFIED', kycExpiryDate: { lte: expiringThreshold } },
        ],
      },
      select: { id: true, name: true, kycStatus: true, kycExpiryDate: true },
      orderBy: [{ kycExpiryDate: 'asc' }],
      take: query.take ?? 50,
      skip: query.skip ?? 0,
    });

    const URGENCY_RANK: Record<KycUrgency, number> = { EXPIRED: 0, NOT_VERIFIED: 1, EXPIRING_SOON: 2 };
    return accounts
      .map((a) => ({ ...a, urgency: kycUrgency(a, now) }))
      .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]);
  }
}
