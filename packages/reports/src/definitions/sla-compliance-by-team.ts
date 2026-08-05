import { z } from 'zod';
import { CasePriority, CaseType, type PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    caseType: z.nativeEnum(CaseType).optional(),
    priority: z.nativeEnum(CasePriority).optional(),
    startedFrom: z.string().date().optional(),
    startedTo: z.string().date().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'team', label: 'Team' },
  { key: 'caseType', label: 'Case Type' },
  { key: 'priority', label: 'Priority' },
];

const measures: ReportMeasure[] = [
  { key: 'caseCount', label: 'SLA Clocks', aggregate: 'count', format: 'number' },
  { key: 'slaBreachedCount', label: 'Breached', aggregate: 'count', format: 'number' },
  { key: 'slaBreachRatePercent', label: 'Breach Rate', aggregate: 'avg', format: 'percent' },
];

/**
 * Case management domain — queries SlaClock joined through Case (caseId
 * not null) and Case.assignedTeam directly, matching
 * complaint-case-volume-trends' carve-out convention. Only SlaClock rows
 * whose team is known (case.assignedTeamId set) are counted — unassigned
 * cases have no team to attribute compliance to. slaBreachRatePercent
 * follows the avg-of-0/100-flag idiom already used by
 * document-compliance-readiness (a 'BREACHED'-status clock contributes
 * 100, everything else 0 — pivotByDimension's weighted-avg then yields a
 * true breach rate per group).
 */
export const slaComplianceByTeamReport: ReportDefinition<Filters> = {
  key: 'sla-compliance-by-team',
  name: 'SLA Compliance by Team',
  description: 'SLA clock breach rate for cases, sliced by assigned team, case type, and priority.',
  category: 'COMPLIANCE',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'bar',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const startedFrom = filters.startedFrom ? new Date(filters.startedFrom) : undefined;
    const startedTo = filters.startedTo ? new Date(filters.startedTo) : undefined;

    const clocks = await prisma.slaClock.findMany({
      where: {
        caseId: { not: null },
        startedAt: startedFrom || startedTo ? { gte: startedFrom, lte: startedTo } : undefined,
        case: {
          assignedTeamId: { not: null },
          caseType: filters.caseType,
          priority: filters.priority,
        },
      },
      include: { case: { include: { assignedTeam: true } } },
    });

    const rawRows: Array<Record<string, ReportCellValue>> = clocks.map((clock) => {
      const breached = clock.status === 'BREACHED';
      return {
        team: clock.case?.assignedTeam?.name ?? 'Unassigned',
        caseType: clock.case?.caseType ?? 'UNKNOWN',
        priority: clock.case?.priority ?? 'UNKNOWN',
        caseCount: 1,
        slaBreachedCount: breached ? 1 : 0,
        slaBreachRatePercent: breached ? 100 : 0,
      };
    });

    const rows = reportRows(rawRows, dimensions, measures, dimension);
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
