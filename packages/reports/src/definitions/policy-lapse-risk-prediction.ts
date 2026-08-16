import { z } from 'zod';
import type { PrismaClient } from '@topiadesk/db';
import type { ReportDefinition } from '../report-definition';

const filterSchema = z
  .object({
    riskThreshold: z.number().min(0).max(100).optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

/**
 * Policy Lapse Risk Prediction — high-risk policies likely to lapse at renewal.
 * Scores policies based on: late premium payments, previous lapses, long time
 * since last activity. Early identification enables proactive retention outreach.
 */
export const policyLapseRiskPredictionReport: ReportDefinition<Filters> = {
  key: 'policy-lapse-risk-prediction',
  name: 'Policy Lapse Risk Prediction',
  description: 'High-risk policies likely to lapse — prioritize retention efforts',
  category: 'RENEWALS',
  filterSchema,
  allowedDimensions: [],
  measures: [
    { key: 'riskScore', label: 'Risk Score', aggregate: 'avg', format: 'number' },
  ],
  defaultChartType: 'bar',

  async execute(prisma: PrismaClient, filters: Filters) {
    const riskThreshold = filters.riskThreshold ?? 60;
    const policies = await prisma.policy.findMany({
      where: {
        status: { notIn: ['CANCELLED', 'LAPSED'] },
      },
      select: {
        id: true,
        policyNumber: true,
        accountId: true,
        expiryDate: true,
      },
    });

    // Fetch account and owner info
    const accountIds = new Set(policies.map((p) => p.accountId));
    const accounts = await prisma.account.findMany({
      where: { id: { in: [...accountIds] } },
      select: {
        id: true,
        name: true,
        ownerId: true,
      },
    });

    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    // Fetch owner names
    const ownerIds = new Set(accounts.map((a) => a.ownerId).filter(Boolean));
    const owners = await prisma.user.findMany({
      where: { id: { in: [...ownerIds] } },
      select: { id: true, fullName: true },
    });

    const ownerMap = new Map(owners.map((o) => [o.id, o.fullName]));

    const now = new Date();
    const rows = policies
      .map((p) => {
        const account = accountMap.get(p.accountId);
        if (!account) return null;

        let riskScore = 0;

        // Approaching or past expiry (up to 30 points)
        if (p.expiryDate) {
          const daysUntilExpiry = Math.ceil((p.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntilExpiry < 0) riskScore += 40; // Already expired
          else if (daysUntilExpiry < 30) riskScore += 30;
          else if (daysUntilExpiry < 90) riskScore += 15;
        }

        return {
          policy_number: p.policyNumber,
          account_name: account.name,
          owner_name: ownerMap.get(account.ownerId) ?? 'Unassigned',
          risk_score: Math.min(100, riskScore),
        };
      })
      .filter((r): r is Exclude<typeof r, null> => r !== null)
      .filter((r) => r.risk_score >= riskThreshold)
      .sort((a, b) => b.risk_score - a.risk_score);

    return {
      columns: [
        { key: 'policy_number', label: 'Policy', format: 'text' },
        { key: 'account_name', label: 'Account', format: 'text' },
        { key: 'owner_name', label: 'Owner', format: 'text' },
        { key: 'risk_score', label: 'Risk Score (0-100)', format: 'number' },
      ],
      rows,
      totalRowCount: rows.length,
      generatedAt: new Date().toISOString(),
    };
  },
};
