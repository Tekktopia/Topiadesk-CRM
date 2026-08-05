import { z } from 'zod';
import type { PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    carrierId: z.string().uuid().optional(),
    submittedFrom: z.string().date().optional(),
    submittedTo: z.string().date().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [{ key: 'carrier', label: 'Carrier' }];

const measures: ReportMeasure[] = [
  { key: 'submissionCount', label: 'Submissions', aggregate: 'count', format: 'number' },
  { key: 'responseRatePercent', label: 'Response Rate', aggregate: 'avg', format: 'percent' },
  { key: 'avgTurnaroundDays', label: 'Avg Turnaround (days)', aggregate: 'avg', format: 'days' },
  { key: 'bindRatePercent', label: 'Bind Rate', aggregate: 'avg', format: 'percent' },
  { key: 'quotedVsBoundVariance', label: 'Quoted vs Bound Premium Variance', aggregate: 'avg', format: 'currency' },
];

export const marketSubmissionPerformanceReport: ReportDefinition<Filters> = {
  key: 'market-submission-performance',
  name: 'Market Submission Performance',
  description: 'Carrier quote responsiveness, turnaround time, bind rate, and quoted-vs-bound premium variance.',
  category: 'SALES',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'bar',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const submittedFrom = filters.submittedFrom ? new Date(filters.submittedFrom) : undefined;
    const submittedTo = filters.submittedTo ? new Date(filters.submittedTo) : undefined;

    const submissions = await prisma.opportunityMarketSubmission.findMany({
      where: {
        carrierId: filters.carrierId,
        submittedAt: submittedFrom || submittedTo ? { gte: submittedFrom, lte: submittedTo } : undefined,
      },
      include: { carrier: true },
    });

    // quotedVsBoundVariance is a per-carrier constant (no meaningful
    // per-submission value) — precomputed here and repeated on every row of
    // that carrier so it survives averaging under `pivotByDimension`
    // regardless of grouping (this report only has one real dimension, but
    // the same repeated-constant trick used by sales-pipeline's win rate
    // keeps the shape consistent).
    const quotedByCarrier = new Map<string, number[]>();
    const boundByCarrier = new Map<string, number[]>();
    for (const s of submissions) {
      if (s.quotedPremium === null) continue;
      const value = Number(s.quotedPremium);
      if (s.status === 'BOUND') {
        (boundByCarrier.get(s.carrierId) ?? boundByCarrier.set(s.carrierId, []).get(s.carrierId)!).push(value);
      } else if (s.status === 'QUOTED') {
        (quotedByCarrier.get(s.carrierId) ?? quotedByCarrier.set(s.carrierId, []).get(s.carrierId)!).push(value);
      }
    }
    const avg = (values: number[] | undefined) => (values && values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0);
    const varianceByCarrier = new Map<string, number>();
    for (const carrierId of new Set([...quotedByCarrier.keys(), ...boundByCarrier.keys()])) {
      varianceByCarrier.set(carrierId, Math.round((avg(boundByCarrier.get(carrierId)) - avg(quotedByCarrier.get(carrierId))) * 100) / 100);
    }

    const rawRows: Array<Record<string, ReportCellValue>> = submissions.map((s) => {
      const responded = s.respondedAt !== null;
      const turnaroundDays = responded ? Math.max(0, Math.round((s.respondedAt!.getTime() - s.submittedAt.getTime()) / 86_400_000)) : 0;
      return {
        carrier: s.carrier.name,
        submissionCount: 1,
        responseRatePercent: responded ? 100 : 0,
        avgTurnaroundDays: turnaroundDays,
        avgTurnaroundDaysWeight: responded ? 1 : 0,
        bindRatePercent: s.status === 'BOUND' ? 100 : 0,
        quotedVsBoundVariance: varianceByCarrier.get(s.carrierId) ?? 0,
      };
    });

    const rows = reportRows(rawRows, dimensions, measures, dimension, { avgTurnaroundDays: 'avgTurnaroundDaysWeight' });
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
