import { z } from 'zod';
import type { PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    industryId: z.string().uuid().optional(),
    topN: z.number().int().positive().max(500).optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'account', label: 'Account' },
  { key: 'industry', label: 'Industry' },
];

const measures: ReportMeasure[] = [
  { key: 'policyCount', label: 'Policy Count', aggregate: 'count', format: 'number' },
  { key: 'totalPremium', label: 'Total Premium', aggregate: 'sum', format: 'currency' },
  { key: 'portfolioSharePercent', label: 'Portfolio Share', aggregate: 'avg', format: 'percent' },
];

export const accountPortfolioConcentrationReport: ReportDefinition<Filters> = {
  key: 'account-portfolio-concentration',
  name: 'Account Portfolio Concentration',
  description: 'Premium and policy count concentration per account, with top-N filtering and industry breakdown.',
  category: 'FINANCE',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'treemap',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const accounts = await prisma.account.findMany({
      where: { industryId: filters.industryId },
      include: {
        industry: true,
        policies: { include: { premiums: true } },
      },
    });

    const accountTotals = accounts.map((account) => ({
      account,
      totalPremium: account.policies.reduce((sum, p) => sum + p.premiums.reduce((s, pr) => s + Number(pr.grossPremium), 0), 0),
    }));
    const grandTotal = accountTotals.reduce((sum, a) => sum + a.totalPremium, 0);

    const ranked = [...accountTotals].sort((a, b) => b.totalPremium - a.totalPremium);
    const selected = filters.topN ? ranked.slice(0, filters.topN) : ranked;
    const selectedAccountIds = new Set(selected.map((a) => a.account.id));

    const rawRows: Array<Record<string, ReportCellValue>> = [];
    for (const { account, totalPremium } of selected) {
      const portfolioSharePercent = grandTotal > 0 ? Math.round((totalPremium / grandTotal) * 1000) / 10 : 0;
      if (account.policies.length === 0) {
        // Still represent zero-policy accounts so top-N/industry breakdowns
        // aren't silently missing an account that legitimately has none.
        rawRows.push({
          account: account.name,
          industry: account.industry?.name ?? 'Unclassified',
          policyCount: 0,
          totalPremium: 0,
          portfolioSharePercent,
        });
        continue;
      }
      for (const policy of account.policies) {
        if (!selectedAccountIds.has(account.id)) continue;
        rawRows.push({
          account: account.name,
          industry: account.industry?.name ?? 'Unclassified',
          policyCount: 1,
          totalPremium: policy.premiums.reduce((s, pr) => s + Number(pr.grossPremium), 0),
          portfolioSharePercent,
        });
      }
    }

    const rows = reportRows(rawRows, dimensions, measures, dimension);
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
