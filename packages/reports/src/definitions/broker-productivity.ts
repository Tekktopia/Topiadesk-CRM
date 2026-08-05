import { z } from 'zod';
import type { PrismaClient } from '@topiadesk/db';
import { buildReportResult, reportColumns, reportRows, type ReportCellValue, type ReportDefinition, type ReportDimension, type ReportMeasure } from '../report-definition';

const filterSchema = z
  .object({
    fromDate: z.string().date().optional(),
    toDate: z.string().date().optional(),
    branchId: z.string().uuid().optional(),
  })
  .strict();

type Filters = z.infer<typeof filterSchema>;

const dimensions: ReportDimension[] = [
  { key: 'broker', label: 'Broker' },
  { key: 'branch', label: 'Branch' },
];

const measures: ReportMeasure[] = [
  { key: 'boundPolicyCount', label: 'Bound Policies', aggregate: 'count', format: 'number' },
  { key: 'premiumPlaced', label: 'Premium Placed', aggregate: 'sum', format: 'currency' },
  { key: 'avgOpportunityToBoundDays', label: 'Avg Opportunity to Bound (days)', aggregate: 'avg', format: 'days' },
  { key: 'activityCount', label: 'Activity Count', aggregate: 'count', format: 'number' },
];

const BOUND_POLICY_STATUSES = ['BOUND', 'ISSUED', 'ENDORSED', 'RENEWED'] as const;

/**
 * There is no FK from Opportunity to the Policy it eventually becomes
 * (confirmed against schema.prisma — Policy carries no opportunityId, and
 * Opportunity has no policy relation). "Opportunity -> Bound days"
 * therefore can't be measured as a literal join; this approximates it as
 * "days from Opportunity.createdAt to actualCloseDate" for opportunities
 * in a won stage (PipelineStage.isWon), which is the closest available
 * proxy for sales-cycle velocity per broker. Flagged in the module report.
 */
export const brokerProductivityReport: ReportDefinition<Filters> = {
  key: 'broker-productivity',
  name: 'Broker Productivity',
  description: 'Bound-policy volume, premium placed, sales velocity, and activity count per broker of record.',
  category: 'PRODUCTIVITY',
  filterSchema,
  allowedDimensions: dimensions,
  measures,
  defaultChartType: 'table',
  async execute(prisma: PrismaClient, filters: Filters, dimension?: string) {
    const dateFrom = filters.fromDate ? new Date(filters.fromDate) : undefined;
    const dateTo = filters.toDate ? new Date(filters.toDate) : undefined;

    const [policies, wonOpportunities, activityGroups] = await Promise.all([
      prisma.policy.findMany({
        where: {
          status: { in: [...BOUND_POLICY_STATUSES] },
          brokerOfRecordId: { not: null },
          inceptionDate: dateFrom || dateTo ? { gte: dateFrom, lte: dateTo } : undefined,
          brokerOfRecord: filters.branchId ? { branchId: filters.branchId } : undefined,
        },
        include: { premiums: true },
      }),
      prisma.opportunity.findMany({
        where: {
          pipelineStage: { isWon: true },
          actualCloseDate: dateFrom || dateTo ? { gte: dateFrom, lte: dateTo } : undefined,
        },
        select: { ownerId: true, createdAt: true, actualCloseDate: true },
      }),
      prisma.activity.groupBy({
        by: ['createdById'],
        where: {
          createdById: { not: null },
          occurredAt: dateFrom || dateTo ? { gte: dateFrom, lte: dateTo } : undefined,
        },
        _count: { _all: true },
      }),
    ]);

    const involvedUserIds = new Set<string>();
    for (const p of policies) if (p.brokerOfRecordId) involvedUserIds.add(p.brokerOfRecordId);
    for (const o of wonOpportunities) involvedUserIds.add(o.ownerId);
    for (const a of activityGroups) if (a.createdById) involvedUserIds.add(a.createdById);

    const users = await prisma.user.findMany({
      where: { id: { in: [...involvedUserIds] } },
      include: { branch: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    interface Accumulator {
      boundPolicyCount: number;
      premiumPlaced: number;
      closeDaysSum: number;
      closeDaysCount: number;
      activityCount: number;
    }
    const stats = new Map<string, Accumulator>();
    const ensure = (id: string): Accumulator => {
      let s = stats.get(id);
      if (!s) {
        s = { boundPolicyCount: 0, premiumPlaced: 0, closeDaysSum: 0, closeDaysCount: 0, activityCount: 0 };
        stats.set(id, s);
      }
      return s;
    };

    for (const p of policies) {
      if (!p.brokerOfRecordId) continue;
      const s = ensure(p.brokerOfRecordId);
      s.boundPolicyCount += 1;
      s.premiumPlaced += p.premiums.reduce((sum, pr) => sum + Number(pr.grossPremium), 0);
    }
    for (const o of wonOpportunities) {
      if (!o.actualCloseDate) continue;
      const s = ensure(o.ownerId);
      s.closeDaysSum += Math.max(0, Math.round((o.actualCloseDate.getTime() - o.createdAt.getTime()) / 86_400_000));
      s.closeDaysCount += 1;
    }
    for (const a of activityGroups) {
      if (!a.createdById) continue;
      ensure(a.createdById).activityCount += a._count._all;
    }

    const rawRows: Array<Record<string, ReportCellValue>> = [...stats.entries()].map(([userId, s]) => {
      const user = userById.get(userId);
      return {
        broker: user?.fullName ?? 'Unknown',
        branch: user?.branch?.name ?? 'Unassigned',
        boundPolicyCount: s.boundPolicyCount,
        premiumPlaced: Math.round(s.premiumPlaced * 100) / 100,
        avgOpportunityToBoundDays: s.closeDaysCount > 0 ? Math.round((s.closeDaysSum / s.closeDaysCount) * 10) / 10 : 0,
        activityCount: s.activityCount,
      };
    });

    const rows = reportRows(rawRows, dimensions, measures, dimension);
    return buildReportResult(reportColumns(dimensions, measures, dimension), rows);
  },
};
