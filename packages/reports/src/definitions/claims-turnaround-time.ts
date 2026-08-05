import { z } from 'zod';
import type { PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    causeOfLossCategoryId: z.string().uuid().optional(),
    dateReportedFrom: z.string().date().optional(),
    dateReportedTo: z.string().date().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'branch', label: 'Branch (Adjuster)' },
  { key: 'causeOfLossCategory', label: 'Cause of Loss' },
  { key: 'lineOfBusiness', label: 'Line of Business' },
];

const measures: ReportMeasure[] = [
  { key: 'claimCount', label: 'Claims', aggregate: 'count', format: 'number' },
  { key: 'settledCount', label: 'Settled', aggregate: 'count', format: 'number' },
  { key: 'avgTurnaroundDays', label: 'Avg Turnaround (days)', aggregate: 'avg', format: 'days' },
  { key: 'totalSettledAmount', label: 'Total Settled Amount', aggregate: 'sum', format: 'currency' },
];

/**
 * Claims domain (owned by a different agent's module in this batch) — this
 * report queries the Claim/Policy/LossCauseCategory Prisma tables directly,
 * per the brief's explicit carve-out, and does not import anything from
 * backend/api/src/modules/case-management/.
 */
export const claimsTurnaroundTimeReport: ReportDefinition<Filters> = {
  key: 'claims-turnaround-time',
  name: 'Claims Turnaround Time',
  description: 'Time from loss report to settlement, by adjuster branch, cause of loss, and line of business.',
  category: 'CLAIMS',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'bar',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const dateReportedFrom = filters.dateReportedFrom ? new Date(filters.dateReportedFrom) : undefined;
    const dateReportedTo = filters.dateReportedTo ? new Date(filters.dateReportedTo) : undefined;

    const claims = await prisma.claim.findMany({
      where: {
        causeOfLossCategoryId: filters.causeOfLossCategoryId,
        dateReported: dateReportedFrom || dateReportedTo ? { gte: dateReportedFrom, lte: dateReportedTo } : undefined,
      },
      include: {
        policy: true,
        causeOfLossCategory: true,
        adjuster: { include: { branch: true } },
      },
    });

    const rawRows: Array<Record<string, ReportCellValue>> = claims.map((claim) => {
      const settled = claim.status === 'SETTLED' && claim.settledAt !== null;
      const turnaroundDays = settled
        ? Math.max(0, Math.round((claim.settledAt!.getTime() - new Date(claim.dateReported).getTime()) / 86_400_000))
        : 0;
      return {
        branch: claim.adjuster?.branch?.name ?? 'Unassigned',
        causeOfLossCategory: claim.causeOfLossCategory?.name ?? claim.causeOfLoss ?? 'Unclassified',
        lineOfBusiness: claim.policy.lineOfBusiness,
        claimCount: 1,
        settledCount: settled ? 1 : 0,
        avgTurnaroundDays: turnaroundDays,
        avgTurnaroundDaysWeight: settled ? 1 : 0,
        totalSettledAmount: settled ? Number(claim.settledAmount ?? 0) : 0,
      };
    });

    const rows = reportRows(rawRows, dimensions, measures, dimension, { avgTurnaroundDays: 'avgTurnaroundDaysWeight' });
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
