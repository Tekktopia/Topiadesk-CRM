import { getPrismaClient, Prisma } from '@topiadesk/db';
import type { CaseQueryDto, DateRangePreset } from './dto/case.dto';

const TERMINAL_STATUSES = ['RESOLVED', 'CLOSED'] as const;

/** UTC calendar-day boundaries — no per-org timezone concept exists elsewhere in this codebase, so this matches every other "today"/date-bucketing computation already in the app (e.g. the renewal-alerts job). */
export function resolveDateRangePreset(preset: DateRangePreset, now: Date = new Date()): { gte: Date; lt: Date } {
  const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const DAY_MS = 86_400_000;
  switch (preset) {
    case 'TODAY': {
      const start = startOfUtcDay(now);
      return { gte: start, lt: new Date(start.getTime() + DAY_MS) };
    }
    case 'YESTERDAY': {
      const start = new Date(startOfUtcDay(now).getTime() - DAY_MS);
      return { gte: start, lt: new Date(start.getTime() + DAY_MS) };
    }
    case 'THIS_WEEK': {
      const start = startOfUtcDay(now);
      const mondayOffset = (start.getUTCDay() + 6) % 7; // days since Monday, Sunday=0 wraps to 6
      const weekStart = new Date(start.getTime() - mondayOffset * DAY_MS);
      return { gte: weekStart, lt: new Date(weekStart.getTime() + 7 * DAY_MS) };
    }
    case 'THIS_MONTH': {
      const gte = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const lt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return { gte, lt };
    }
  }
}

function resolutionDueByWhere(value: NonNullable<CaseQueryDto['resolutionDueBy']>, now: Date): Prisma.CaseWhereInput {
  const base = { status: 'RUNNING' as const, slaTarget: { metricType: 'RESOLUTION' as const } };
  if (value === 'OVERDUE') {
    return { slaClocks: { some: { ...base, dueAt: { lt: now } } } };
  }
  const { gte, lt } = resolveDateRangePreset(value === 'DUE_TODAY' ? 'TODAY' : 'THIS_WEEK', now);
  return { slaClocks: { some: { ...base, dueAt: { gte, lt } } } };
}

/**
 * Single source of truth for GET /cases and GET /cases/count's `where`
 * clause, so the ticket workspace's live result count and its live result
 * set can never drift apart. Every branch only fires when the
 * corresponding query param is present — omitting every new param
 * reproduces the exact same query the original hand-written `list()` built,
 * which is what keeps this change additive/non-breaking for existing
 * callers (useCases({}), link-merge-actions.tsx, the Queue tab).
 */
export async function buildCaseWhere(query: CaseQueryDto, currentUserId: string, now: Date = new Date()): Promise<Prisma.CaseWhereInput> {
  const and: Prisma.CaseWhereInput[] = [
    {
      status: query.status,
      priority: query.priority,
      caseType: query.caseType,
      assignedToId: query.assignedToId,
      assignedTeamId: query.assignedTeamId,
      accountId: query.accountId,
      categoryId: query.categoryId,
      createdById: query.raisedByUserId,
      parentCaseId: query.parentCaseId,
    },
  ];

  if (query.assignedToIds && query.assignedToIds.length > 0) and.push({ assignedToId: { in: query.assignedToIds } });
  if (query.assignedTeamIds && query.assignedTeamIds.length > 0) and.push({ assignedTeamId: { in: query.assignedTeamIds } });
  if (query.statuses && query.statuses.length > 0) and.push({ status: { in: query.statuses } });
  if (query.excludeStatuses && query.excludeStatuses.length > 0) and.push({ status: { notIn: query.excludeStatuses } });
  if (query.priorities && query.priorities.length > 0) and.push({ priority: { in: query.priorities } });

  if (query.myTeams === 'true') {
    const memberships = await getPrismaClient().teamMember.findMany({ where: { userId: currentUserId }, select: { teamId: true } });
    and.push({ assignedTeamId: { in: memberships.map((m) => m.teamId) } });
  }

  if (query.watchingUserId) and.push({ watchers: { some: { userId: query.watchingUserId } } });
  if (query.undeliveredOnly === 'true') and.push({ comments: { some: { emailDeliveryStatus: 'FAILED' } } });
  if (query.resolutionDueBy) and.push(resolutionDueByWhere(query.resolutionDueBy, now));

  if (query.newOrMine === 'true') {
    and.push({
      OR: [{ status: 'NEW' }, { assignedToId: currentUserId, status: { notIn: [...TERMINAL_STATUSES] } }],
    });
  }

  if (query.createdPreset) and.push({ createdAt: resolveDateRangePreset(query.createdPreset, now) });
  if (query.closedPreset) and.push({ closedAt: resolveDateRangePreset(query.closedPreset, now) });
  if (query.resolvedPreset) and.push({ resolvedAt: resolveDateRangePreset(query.resolvedPreset, now) });

  if (query.search && query.search.trim().length > 0) {
    const term = query.search.trim();
    and.push({ OR: [{ subject: { contains: term, mode: 'insensitive' } }, { caseNumber: { contains: term, mode: 'insensitive' } }] });
  }

  return { AND: and };
}

export function buildCaseOrderBy(query: CaseQueryDto): Prisma.CaseOrderByWithRelationInput[] {
  const dir = query.sortDir ?? 'desc';
  switch (query.sortBy) {
    case 'priority':
      return [{ priority: dir }, { createdAt: 'desc' }];
    case 'status':
      return [{ status: dir }, { createdAt: 'desc' }];
    case 'createdAt':
    default:
      return [{ createdAt: dir }];
  }
}

