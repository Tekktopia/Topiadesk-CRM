import { z } from 'zod';
import type { PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    carrierId: z.string().uuid().optional(),
    lineOfBusiness: z.string().min(1).optional(),
    expiryFrom: z.string().date().optional(),
    expiryTo: z.string().date().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'branch', label: 'Branch' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'lineOfBusiness', label: 'Line of Business' },
  { key: 'expiryMonth', label: 'Expiry Month' },
];

const measures: ReportMeasure[] = [
  { key: 'totalExpiring', label: 'Total Expiring', aggregate: 'count', format: 'number' },
  { key: 'lapsedCount', label: 'Lapsed', aggregate: 'count', format: 'number' },
  // Each finest-grain row contributes 0 or 100 — averaging IS the lapse
  // rate percentage for whatever group the rows get collapsed into.
  { key: 'lapseRatePercent', label: 'Lapse Rate', aggregate: 'avg', format: 'percent' },
];

export const policyLapseRateReport: ReportDefinition<Filters> = {
  key: 'policy-lapse-rate',
  name: 'Policy Lapse Rate',
  description: 'Share of expiring policies that lapsed instead of renewing, trended by expiry month and sliceable by branch/carrier/line of business.',
  category: 'RENEWALS',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'line',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const expiryFrom = filters.expiryFrom ? new Date(filters.expiryFrom) : undefined;
    const expiryTo = filters.expiryTo ? new Date(filters.expiryTo) : undefined;

    const policies = await prisma.policy.findMany({
      where: {
        carrierId: filters.carrierId,
        lineOfBusiness: filters.lineOfBusiness,
        expiryDate: expiryFrom || expiryTo ? { gte: expiryFrom, lte: expiryTo } : undefined,
      },
      include: { carrier: true, brokerOfRecord: { include: { branch: true } } },
    });

    const rawRows: Array<Record<string, ReportCellValue>> = policies.map((p) => {
      const lapsed = p.status === 'LAPSED';
      return {
        branch: p.brokerOfRecord?.branch?.name ?? 'Unassigned',
        carrier: p.carrier.name,
        lineOfBusiness: p.lineOfBusiness,
        expiryMonth: p.expiryDate.toISOString().slice(0, 7),
        totalExpiring: 1,
        lapsedCount: lapsed ? 1 : 0,
        lapseRatePercent: lapsed ? 100 : 0,
      };
    });

    const rows = reportRows(rawRows, dimensions, measures, dimension);
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
