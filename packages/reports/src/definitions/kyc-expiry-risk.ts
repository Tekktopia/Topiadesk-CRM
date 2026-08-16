import { z } from 'zod';
import type { PrismaClient } from '@topiadesk/db';
import type { ReportDefinition } from '../report-definition';

const filterSchema = z
  .object({
    daysUntilExpiry: z.number().positive().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

/**
 * KYC Expiry Risk — accounts with verified KYC approaching expiry.
 * Helps compliance teams prioritize renewal notifications before policies
 * lock due to expired KYC. Filtered to VERIFIED status only, sorted by
 * expiry date ascending (soonest first).
 */
export const kycExpiryRiskReport: ReportDefinition<Filters> = {
  key: 'kyc-expiry-risk',
  name: 'KYC Expiry Risk',
  description: 'Accounts with verified KYC expiring soon — prioritize renewals and verification follow-up',
  category: 'COMPLIANCE',
  filterSchema,
  allowedDimensions: [],
  measures: [
    { key: 'daysRemaining', label: 'Days Until Expiry', aggregate: 'count', format: 'number' },
    { key: 'activePolicies', label: 'Active Policies', aggregate: 'count', format: 'number' },
  ],
  defaultChartType: 'table',

  async execute(prisma: PrismaClient, filters: Filters) {
    const daysUntilExpiry = filters.daysUntilExpiry ?? 60;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysUntilExpiry);

    const accounts = await prisma.account.findMany({
      where: {
        kycStatus: 'VERIFIED',
        kycExpiryDate: {
          lte: cutoffDate,
          gt: new Date(), // only include accounts not yet expired
        },
      },
      select: {
        id: true,
        name: true,
        kycExpiryDate: true,
        _count: { select: { policies: { where: { status: { notIn: ['CANCELLED', 'LAPSED'] } } } } },
      },
      orderBy: { kycExpiryDate: 'asc' },
    });

    const now = new Date();
    const rows = accounts.map((a) => {
      const daysUntil = Math.ceil((a.kycExpiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        account_name: a.name,
        kyc_expiry_date: a.kycExpiryDate?.toISOString() ?? null,
        days_remaining: daysUntil,
        active_policies: a._count.policies,
        renewals_at_risk: a._count.policies > 0 ? 'Yes' : 'No',
      };
    });

    return {
      columns: [
        { key: 'account_name', label: 'Account', format: 'text' },
        { key: 'kyc_expiry_date', label: 'KYC Expiry Date', format: 'date' },
        { key: 'days_remaining', label: 'Days Remaining', format: 'number' },
        { key: 'active_policies', label: 'Active Policies', format: 'number' },
        { key: 'renewals_at_risk', label: 'Renewals At Risk', format: 'text' },
      ],
      rows,
      totalRowCount: rows.length,
      generatedAt: new Date().toISOString(),
    };
  },
};
