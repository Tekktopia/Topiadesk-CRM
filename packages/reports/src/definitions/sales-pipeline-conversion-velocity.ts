import { z } from 'zod';
import type { PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    pipelineId: z.string().uuid().optional(),
    createdFrom: z.string().date().optional(),
    createdTo: z.string().date().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'stage', label: 'Pipeline Stage' },
  { key: 'pipeline', label: 'Pipeline' },
];

const measures: ReportMeasure[] = [
  { key: 'opportunityCount', label: 'Opportunities at Stage', aggregate: 'count', format: 'number' },
  { key: 'stageConversionPercent', label: 'Cumulative Conversion from Entry', aggregate: 'avg', format: 'percent' },
  { key: 'avgDaysInStage', label: 'Avg Age in Current Stage (days)', aggregate: 'avg', format: 'days' },
  { key: 'winRatePercent', label: 'Overall Win Rate', aggregate: 'avg', format: 'percent' },
];

/**
 * The schema has no OpportunityStageHistory table — Opportunity only
 * carries its CURRENT pipelineStageId, not a log of stage transitions. Two
 * measures here are therefore documented approximations rather than exact
 * historical figures:
 *  - stageConversionPercent: a funnel built from CURRENT stage distribution
 *    (count of opportunities at-or-past each stage's `order`, relative to
 *    the pipeline's first stage), not true stage-by-stage transition
 *    tracking. Closed-lost opportunities still count toward every stage
 *    they passed through before exiting (their `order` is typically the
 *    pipeline's highest, per the seeded "Closed Lost" stage).
 *  - avgDaysInStage: days since Opportunity.updatedAt for opportunities
 *    currently sitting in that stage — a proxy for "time in stage", not a
 *    precise stage-entry timestamp (updatedAt changes on any field edit).
 * winRatePercent is exact (won / (won + lost) among closed opportunities in
 * the filtered set) and is repeated on every row so it survives averaging
 * under any dimension/pivot choice.
 */
export const salesPipelineConversionVelocityReport: ReportDefinition<Filters> = {
  key: 'sales-pipeline-conversion-velocity',
  name: 'Sales Pipeline Conversion & Velocity',
  description: 'Funnel drop-off by stage, time spent in the current stage, and overall win rate.',
  category: 'SALES',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'funnel',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const createdFrom = filters.createdFrom ? new Date(filters.createdFrom) : undefined;
    const createdTo = filters.createdTo ? new Date(filters.createdTo) : undefined;

    const opportunities = await prisma.opportunity.findMany({
      where: {
        pipelineStage: filters.pipelineId ? { pipelineId: filters.pipelineId } : undefined,
        createdAt: createdFrom || createdTo ? { gte: createdFrom, lte: createdTo } : undefined,
      },
      include: { pipelineStage: { include: { pipeline: true } } },
    });

    if (opportunities.length === 0) {
      return buildReportResult(reportColumns(dimensions, measures, dimension), []);
    }

    const wonCount = opportunities.filter((o) => o.pipelineStage.isWon).length;
    const lostCount = opportunities.filter((o) => o.pipelineStage.isLost).length;
    const winRatePercent = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 1000) / 10 : 0;

    // First-stage entry count per pipeline (order 0) — the denominator for
    // every stage's cumulative conversion in that same pipeline.
    const firstStageOrderByPipeline = new Map<string, number>();
    for (const o of opportunities) {
      const pid = o.pipelineStage.pipelineId;
      const current = firstStageOrderByPipeline.get(pid);
      if (current === undefined || o.pipelineStage.order < current) firstStageOrderByPipeline.set(pid, o.pipelineStage.order);
    }
    const entryCountByPipeline = new Map<string, number>();
    for (const o of opportunities) {
      const pid = o.pipelineStage.pipelineId;
      if (o.pipelineStage.order === firstStageOrderByPipeline.get(pid)) {
        entryCountByPipeline.set(pid, (entryCountByPipeline.get(pid) ?? 0) + 1);
      }
    }
    const cumulativeAtOrPast = (pipelineId: string, order: number): number =>
      opportunities.filter((o) => o.pipelineStage.pipelineId === pipelineId && o.pipelineStage.order >= order).length;

    const now = Date.now();
    const rawRows: Array<Record<string, ReportCellValue>> = opportunities.map((o) => {
      const pipelineId = o.pipelineStage.pipelineId;
      const entryCount = entryCountByPipeline.get(pipelineId) ?? opportunities.length;
      const cumulative = cumulativeAtOrPast(pipelineId, o.pipelineStage.order);
      const stageConversionPercent = entryCount > 0 ? Math.round((cumulative / entryCount) * 1000) / 10 : 0;
      const avgDaysInStage = Math.max(0, Math.round((now - o.updatedAt.getTime()) / 86_400_000));
      return {
        stage: o.pipelineStage.name,
        pipeline: o.pipelineStage.pipeline.name,
        opportunityCount: 1,
        stageConversionPercent,
        avgDaysInStage,
        winRatePercent,
      };
    });

    const rows = reportRows(rawRows, dimensions, measures, dimension);
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
