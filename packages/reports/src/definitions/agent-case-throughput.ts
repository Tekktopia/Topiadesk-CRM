import { z } from 'zod';
import { CaseType, type PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    caseType: z.nativeEnum(CaseType).optional(),
    createdFrom: z.string().date().optional(),
    createdTo: z.string().date().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'agent', label: 'Agent' },
  { key: 'caseType', label: 'Case Type' },
  { key: 'month', label: 'Month' },
];

const measures: ReportMeasure[] = [
  { key: 'casesAssigned', label: 'Cases Assigned', aggregate: 'count', format: 'number' },
  { key: 'casesResolved', label: 'Cases Resolved', aggregate: 'count', format: 'number' },
  { key: 'avgResolutionHours', label: 'Avg Resolution (hrs)', aggregate: 'avg', format: 'number' },
];

/**
 * Case management domain — queries the Case Prisma table directly, scoped
 * to `assignedToId != null` (a case with no agent has nothing to attribute
 * throughput to). Case management analogue of broker-productivity (which
 * covers Opportunity/CRM productivity, not Case throughput).
 */
export const agentCaseThroughputReport: ReportDefinition<Filters> = {
  key: 'agent-case-throughput',
  name: 'Agent Case Throughput',
  description: 'Cases assigned, cases resolved, and average resolution time per agent, sliced by case type and month.',
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
        assignedToId: { not: null },
        caseType: filters.caseType,
        createdAt: createdFrom || createdTo ? { gte: createdFrom, lte: createdTo } : undefined,
      },
      include: { assignedTo: true },
    });

    const rawRows: Array<Record<string, ReportCellValue>> = cases.map((c) => {
      const resolved = c.resolvedAt !== null;
      const resolutionHours = resolved ? Math.max(0, Math.round(((c.resolvedAt!.getTime() - c.createdAt.getTime()) / 3_600_000) * 100) / 100) : 0;
      return {
        agent: c.assignedTo?.fullName ?? 'Unknown',
        caseType: c.caseType,
        month: c.createdAt.toISOString().slice(0, 7),
        casesAssigned: 1,
        casesResolved: resolved ? 1 : 0,
        avgResolutionHours: resolutionHours,
        avgResolutionHoursWeight: resolved ? 1 : 0,
      };
    });

    const rows = reportRows(rawRows, dimensions, measures, dimension, { avgResolutionHours: 'avgResolutionHoursWeight' });
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
