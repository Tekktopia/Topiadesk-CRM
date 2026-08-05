import { z } from 'zod';
import { CasePriority, type PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    priority: z.nativeEnum(CasePriority).optional(),
    createdFrom: z.string().date().optional(),
    createdTo: z.string().date().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'category', label: 'Category' },
  { key: 'month', label: 'Month' },
];

const measures: ReportMeasure[] = [
  { key: 'caseCount', label: 'Complaints', aggregate: 'count', format: 'number' },
  { key: 'resolvedCount', label: 'Resolved', aggregate: 'count', format: 'number' },
  { key: 'avgResolutionDays', label: 'Avg Resolution (days)', aggregate: 'avg', format: 'days' },
];

/**
 * Case management domain (owned by a different agent's module in this
 * batch) — queries the Case Prisma table directly, filtered to
 * caseType=COMPLAINT, per the brief's explicit carve-out. Does not import
 * anything from backend/api/src/modules/case-management/.
 */
export const complaintCaseVolumeTrendsReport: ReportDefinition<Filters> = {
  key: 'complaint-case-volume-trends',
  name: 'Complaint Case Volume Trends',
  description: 'Complaint volume and resolution time trended by month, sliced by status, priority, and category.',
  category: 'COMPLIANCE',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'line',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const createdFrom = filters.createdFrom ? new Date(filters.createdFrom) : undefined;
    const createdTo = filters.createdTo ? new Date(filters.createdTo) : undefined;

    const cases = await prisma.case.findMany({
      where: {
        caseType: 'COMPLAINT',
        priority: filters.priority,
        createdAt: createdFrom || createdTo ? { gte: createdFrom, lte: createdTo } : undefined,
      },
      include: { category: true },
    });

    const rawRows: Array<Record<string, ReportCellValue>> = cases.map((c) => {
      const resolved = (c.status === 'RESOLVED' || c.status === 'CLOSED') && c.resolvedAt !== null;
      const resolutionDays = resolved ? Math.max(0, Math.round((c.resolvedAt!.getTime() - c.createdAt.getTime()) / 86_400_000)) : 0;
      return {
        status: c.status,
        priority: c.priority,
        category: c.category?.name ?? 'Uncategorized',
        month: c.createdAt.toISOString().slice(0, 7),
        caseCount: 1,
        resolvedCount: resolved ? 1 : 0,
        avgResolutionDays: resolutionDays,
        avgResolutionDaysWeight: resolved ? 1 : 0,
      };
    });

    const rows = reportRows(rawRows, dimensions, measures, dimension, { avgResolutionDays: 'avgResolutionDaysWeight' });
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
