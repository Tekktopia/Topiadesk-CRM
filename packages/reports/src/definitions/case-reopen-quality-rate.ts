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
  { key: 'reopenedCaseCount', label: 'Reopened at Least Once', aggregate: 'count', format: 'number' },
  { key: 'avgReopenCount', label: 'Avg Reopens per Case', aggregate: 'avg', format: 'number' },
];

/**
 * Case management domain — queries the Case Prisma table directly, off
 * Case.reopenCount (untouched by any existing report). A quality signal
 * distinct from resolution-time reports: a category that resolves fast but
 * gets reopened often is a hidden quality problem those reports can't see.
 * avgReopenCount uses the default unweighted per-case average
 * (pivotByDimension's default weight of 1 per row) — exactly "mean
 * reopenCount across cases in this group," no special weighting needed.
 */
export const caseReopenQualityRateReport: ReportDefinition<Filters> = {
  key: 'case-reopen-quality-rate',
  name: 'Case Reopen & Quality Rate',
  description: 'Reopen frequency per case, sliced by category, case type, and priority — a quality signal independent of resolution speed.',
  category: 'PRODUCTIVITY',
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

    const rawRows: Array<Record<string, ReportCellValue>> = cases.map((c) => ({
      category: c.category?.name ?? 'Uncategorized',
      caseType: c.caseType,
      priority: c.priority,
      caseCount: 1,
      reopenedCaseCount: c.reopenCount > 0 ? 1 : 0,
      avgReopenCount: c.reopenCount,
    }));

    const rows = reportRows(rawRows, dimensions, measures, dimension);
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
