import { z } from 'zod';
import { RenewalStatus, type PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    carrierId: z.string().uuid().optional(),
    status: z.nativeEnum(RenewalStatus).optional(),
    dueFrom: z.string().date().optional(),
    dueTo: z.string().date().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'carrier', label: 'Carrier' },
  { key: 'renewalStatus', label: 'Renewal Status' },
  { key: 'lineOfBusiness', label: 'Line of Business' },
];

const measures: ReportMeasure[] = [
  { key: 'scheduleCount', label: 'Renewals', aggregate: 'count', format: 'number' },
  { key: 'premiumAtStake', label: 'Premium at Stake', aggregate: 'sum', format: 'currency' },
];

/**
 * "Premium at stake" is the most recently due Premium row per policy (not
 * necessarily paid yet) — RenewalSchedule itself carries no premium amount,
 * so this is the closest available proxy for renewal value without
 * re-deriving a full quote. Typed Prisma `findMany` + JS grouping rather
 * than `groupBy`, since the grouping columns (carrier name, line of
 * business) live on the joined Policy/Carrier, which Prisma's typed
 * `groupBy` cannot group across relations.
 */
export const renewalPipelineByCarrierReport: ReportDefinition<Filters> = {
  key: 'renewal-pipeline-by-carrier',
  name: 'Renewal Pipeline by Carrier',
  description: 'Upcoming renewals grouped by carrier, status, and line of business, with the most recent premium value at stake.',
  category: 'RENEWALS',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'funnel',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const schedules = await prisma.renewalSchedule.findMany({
      where: {
        status: filters.status,
        renewalDueDate: {
          gte: filters.dueFrom ? new Date(filters.dueFrom) : undefined,
          lte: filters.dueTo ? new Date(filters.dueTo) : undefined,
        },
        policy: filters.carrierId ? { carrierId: filters.carrierId } : undefined,
      },
      include: {
        policy: {
          include: {
            carrier: true,
            premiums: { orderBy: { dueDate: 'desc' }, take: 1 },
          },
        },
      },
    });

    const rawRows: Array<Record<string, ReportCellValue>> = schedules.map((schedule) => ({
      carrier: schedule.policy.carrier.name,
      renewalStatus: schedule.status,
      lineOfBusiness: schedule.policy.lineOfBusiness,
      scheduleCount: 1,
      premiumAtStake: Number(schedule.policy.premiums[0]?.grossPremium ?? 0),
    }));

    const rows = reportRows(rawRows, dimensions, measures, dimension);
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
