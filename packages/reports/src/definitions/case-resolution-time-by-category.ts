import { z } from 'zod';
import { CasePriority, CaseType, type PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    caseType: z.nativeEnum(CaseType).optional(),
    priority: z.nativeEnum(CasePriority).optional(),
    createdFrom: z.string().date().optional(),
    createdTo: z.string().date().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'category', label: 'Category' },
  { key: 'caseType', label: 'Case Type' },
  { key: 'priority', label: 'Priority' },
];

const measures: ReportMeasure[] = [
  { key: 'caseCount', label: 'Cases', aggregate: 'count', format: 'number' },
  { key: 'resolvedCount', label: 'Resolved', aggregate: 'count', format: 'number' },
  { key: 'avgResolutionHours', label: 'Avg Resolution (hrs)', aggregate: 'avg', format: 'number' },
  { key: 'avgFirstResponseHours', label: 'Avg First Response (hrs)', aggregate: 'avg', format: 'number' },
];

/**
 * Case management domain — queries the Case Prisma table directly, all
 * caseTypes (not scoped to COMPLAINT, unlike complaint-case-volume-trends —
 * complements rather than duplicates it). Case management module analogue
 * of claims-turnaround-time. Does not import anything from
 * backend/api/src/modules/case-management/.
 */
export const caseResolutionTimeByCategoryReport: ReportDefinition<Filters> = {
  key: 'case-resolution-time-by-category',
  name: 'Case Resolution Time by Category',
  description: 'Case volume, resolution rate, and average first-response/resolution time, sliced by category, case type, and priority.',
  category: 'COMPLIANCE',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'bar',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const createdFrom = filters.createdFrom ? new Date(filters.createdFrom) : undefined;
    const createdTo = filters.createdTo ? new Date(filters.createdTo) : undefined;

    const cases = await prisma.case.findMany({
      where: {
        caseType: filters.caseType,
        priority: filters.priority,
        createdAt: createdFrom || createdTo ? { gte: createdFrom, lte: createdTo } : undefined,
      },
      include: { category: true },
    });

    const rawRows: Array<Record<string, ReportCellValue>> = cases.map((c) => {
      const resolved = c.resolvedAt !== null;
      const resolutionHours = resolved ? Math.max(0, Math.round(((c.resolvedAt!.getTime() - c.createdAt.getTime()) / 3_600_000) * 100) / 100) : 0;
      const responded = c.firstRespondedAt !== null;
      const firstResponseHours = responded ? Math.max(0, Math.round(((c.firstRespondedAt!.getTime() - c.createdAt.getTime()) / 3_600_000) * 100) / 100) : 0;
      return {
        category: c.category?.name ?? 'Uncategorized',
        caseType: c.caseType,
        priority: c.priority,
        caseCount: 1,
        resolvedCount: resolved ? 1 : 0,
        avgResolutionHours: resolutionHours,
        avgResolutionHoursWeight: resolved ? 1 : 0,
        avgFirstResponseHours: firstResponseHours,
        avgFirstResponseHoursWeight: responded ? 1 : 0,
      };
    });

    const rows = reportRows(rawRows, dimensions, measures, dimension, {
      avgResolutionHours: 'avgResolutionHoursWeight',
      avgFirstResponseHours: 'avgFirstResponseHoursWeight',
    });
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
