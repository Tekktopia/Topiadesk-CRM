import { z } from 'zod';
import type { PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    carrierId: z.string().uuid().optional(),
    lineOfBusiness: z.string().min(1).optional(),
    dueFrom: z.string().date().optional(),
    dueTo: z.string().date().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'branch', label: 'Branch' },
  { key: 'broker', label: 'Broker' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'lineOfBusiness', label: 'Line of Business' },
  { key: 'month', label: 'Month' },
];

const measures: ReportMeasure[] = [
  { key: 'commissionAmount', label: 'Commission Revenue', aggregate: 'sum', format: 'currency' },
  { key: 'premiumCount', label: 'Premium Count', aggregate: 'count', format: 'number' },
];

export const commissionRevenueReport: ReportDefinition<Filters> = {
  key: 'commission-revenue',
  name: 'Commission Revenue',
  description: 'Commission earned, sliceable by branch, broker, carrier, line of business, and month.',
  category: 'FINANCE',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'bar',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const dueFrom = filters.dueFrom ? new Date(filters.dueFrom) : undefined;
    const dueTo = filters.dueTo ? new Date(filters.dueTo) : undefined;

    const premiums = await prisma.premium.findMany({
      where: {
        commissionAmount: { not: null },
        dueDate: dueFrom || dueTo ? { gte: dueFrom, lte: dueTo } : undefined,
        policy: {
          carrierId: filters.carrierId,
          lineOfBusiness: filters.lineOfBusiness,
        },
      },
      include: {
        policy: { include: { carrier: true, brokerOfRecord: { include: { branch: true } } } },
      },
    });

    const rawRows: Array<Record<string, ReportCellValue>> = premiums.map((pr) => ({
      branch: pr.policy.brokerOfRecord?.branch?.name ?? 'Unassigned',
      broker: pr.policy.brokerOfRecord?.fullName ?? 'Unassigned',
      carrier: pr.policy.carrier.name,
      lineOfBusiness: pr.policy.lineOfBusiness,
      month: pr.dueDate.toISOString().slice(0, 7),
      commissionAmount: Number(pr.commissionAmount ?? 0),
      premiumCount: 1,
    }));

    const rows = reportRows(rawRows, dimensions, measures, dimension);
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
