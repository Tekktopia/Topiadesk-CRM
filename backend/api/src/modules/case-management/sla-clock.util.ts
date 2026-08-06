import { getPrismaClient, type CaseManagementEntityType, type CasePriority, type CaseType, type SlaPolicy } from '@topiadesk/db';
import { addBusinessMinutes, businessMinutesBetween, type BusinessHolidayLike, type BusinessHoursCalendarLike, type WeeklyHours } from './business-hours.util';

/** No businessHoursCalendarId on the policy -> treat as always-open (24/7, UTC) rather than requiring every SlaPolicy to configure a calendar. */
const ALWAYS_OPEN_CALENDAR: BusinessHoursCalendarLike = {
  timezone: 'UTC',
  weeklyHours: {
    mon: { start: '00:00', end: '23:59' },
    tue: { start: '00:00', end: '23:59' },
    wed: { start: '00:00', end: '23:59' },
    thu: { start: '00:00', end: '23:59' },
    fri: { start: '00:00', end: '23:59' },
    sat: { start: '00:00', end: '23:59' },
    sun: { start: '00:00', end: '23:59' },
  },
};

async function loadCalendar(businessHoursCalendarId: string | null): Promise<{ calendar: BusinessHoursCalendarLike; holidays: BusinessHolidayLike[] }> {
  if (!businessHoursCalendarId) return { calendar: ALWAYS_OPEN_CALENDAR, holidays: [] };
  const prisma = getPrismaClient();
  const [calendarRow, holidays] = await Promise.all([
    prisma.businessHoursCalendar.findUnique({ where: { id: businessHoursCalendarId } }),
    prisma.businessHoliday.findMany({ where: { calendarId: businessHoursCalendarId } }),
  ]);
  if (!calendarRow) return { calendar: ALWAYS_OPEN_CALENDAR, holidays: [] };
  return { calendar: { timezone: calendarRow.timezone, weeklyHours: calendarRow.weeklyHours as WeeklyHours }, holidays };
}

/**
 * Picks the most specific active SlaPolicy for (entityType, caseType,
 * priority): a policy naming both caseType AND priority beats one naming
 * only one, which beats a wildcard (neither set) policy — same
 * most-specific-wins principle as CSS specificity, applied to a 0-2 score
 * since there are only two optional dimensions here. When two policies
 * still tie on specificity score, `rank` (admin-orderable, higher wins —
 * same convention as AssignmentRule.priority) breaks the tie explicitly,
 * so multi-policy-match behavior is a pickable admin decision, not
 * whichever row `findMany` happens to return first.
 *
 * `accountId`, when given, is checked FIRST against AccountSlaOverride — an
 * exact (accountId, entityType) match short-circuits the whole specificity
 * scoring below, the same "explicit beats resolved" precedence
 * `ensureCaseSlaClocks`/`ensureClaimSlaClocks`'s own `explicitSlaPolicyId`
 * already has one level up. An override pointing at an inactive policy is
 * treated as no override (falls through to normal resolution) rather than
 * silently applying a policy an admin has since deactivated.
 */
export async function resolveSlaPolicy(
  entityType: CaseManagementEntityType,
  caseType: CaseType | null,
  priority: CasePriority,
  accountId?: string | null,
): Promise<SlaPolicy | null> {
  const prisma = getPrismaClient();
  if (accountId) {
    const override = await prisma.accountSlaOverride.findUnique({
      where: { accountId_entityType: { accountId, entityType } },
      include: { slaPolicy: true },
    });
    if (override?.slaPolicy.isActive) return override.slaPolicy;
  }
  const candidates = await prisma.slaPolicy.findMany({ where: { entityType, isActive: true } });
  let best: { policy: SlaPolicy; score: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.caseType != null && candidate.caseType !== caseType) continue;
    if (candidate.priority != null && candidate.priority !== priority) continue;
    const score = (candidate.caseType != null ? 1 : 0) + (candidate.priority != null ? 1 : 0);
    if (!best || score > best.score || (score === best.score && candidate.rank > best.policy.rank)) {
      best = { policy: candidate, score };
    }
  }
  return best?.policy ?? null;
}

/** Creates one SlaClock per FIRST_RESPONSE/RESOLUTION SlaTarget on `policy` — Case's two-clock model. */
export async function startCaseClocks(caseId: string, policy: SlaPolicy, startedAt: Date = new Date()): Promise<void> {
  const prisma = getPrismaClient();
  const [targets, { calendar, holidays }] = await Promise.all([
    prisma.slaTarget.findMany({ where: { slaPolicyId: policy.id, metricType: { in: ['FIRST_RESPONSE', 'RESOLUTION'] } } }),
    loadCalendar(policy.businessHoursCalendarId),
  ]);
  for (const target of targets) {
    const dueAt = addBusinessMinutes(calendar, holidays, startedAt, target.targetMinutes);
    await prisma.slaClock.create({ data: { caseId, slaTargetId: target.id, status: 'RUNNING', startedAt, dueAt } });
  }
}

/** Case creation entry point: resolves a policy if none was given explicitly, persists it, and starts its clocks. No-ops silently if no policy matches — SLA tracking is additive, not a hard requirement to create a Case. */
export async function ensureCaseSlaClocks(caseId: string, explicitSlaPolicyId: string | null, caseType: CaseType, priority: CasePriority, accountId?: string | null): Promise<void> {
  const prisma = getPrismaClient();
  const policy = explicitSlaPolicyId
    ? await prisma.slaPolicy.findUnique({ where: { id: explicitSlaPolicyId } })
    : await resolveSlaPolicy('CASE', caseType, priority, accountId);
  if (!policy || !policy.isActive) return;
  if (!explicitSlaPolicyId) {
    await prisma.case.update({ where: { id: caseId }, data: { slaPolicyId: policy.id } });
  }
  await startCaseClocks(caseId, policy);
}

/** Creates a STAGE_TRANSITION SlaClock for every SlaTarget on `policy` keyed off `fromStatus` — Claim's per-stage model. */
export async function startClaimStageClock(claimId: string, policy: SlaPolicy, fromStatus: string, startedAt: Date = new Date()): Promise<void> {
  const prisma = getPrismaClient();
  const [targets, { calendar, holidays }] = await Promise.all([
    prisma.slaTarget.findMany({ where: { slaPolicyId: policy.id, metricType: 'STAGE_TRANSITION', fromStatus } }),
    loadCalendar(policy.businessHoursCalendarId),
  ]);
  for (const target of targets) {
    const dueAt = addBusinessMinutes(calendar, holidays, startedAt, target.targetMinutes);
    await prisma.slaClock.create({ data: { claimId, slaTargetId: target.id, status: 'RUNNING', startedAt, dueAt } });
  }
}

/** Claim creation entry point — mirrors ensureCaseSlaClocks, starting the stage clock for Claim's initial NOTIFIED status. */
export async function ensureClaimSlaClocks(claimId: string, explicitSlaPolicyId: string | null, priority: CasePriority, initialStatus: string, accountId?: string | null): Promise<void> {
  const prisma = getPrismaClient();
  const policy = explicitSlaPolicyId
    ? await prisma.slaPolicy.findUnique({ where: { id: explicitSlaPolicyId } })
    : await resolveSlaPolicy('CLAIM', null, priority, accountId);
  if (!policy || !policy.isActive) return;
  if (!explicitSlaPolicyId) {
    await prisma.claim.update({ where: { id: claimId }, data: { slaPolicyId: policy.id } });
  }
  await startClaimStageClock(claimId, policy, initialStatus);
}

/** Called after a validated Claim status transition: satisfies any RUNNING stage clock keyed off the status just left, then starts a fresh one keyed off the status just entered (if the claim's policy defines a target for it). */
export async function advanceClaimStageClocks(claimId: string, fromStatus: string, toStatus: string, at: Date = new Date()): Promise<void> {
  const prisma = getPrismaClient();
  const runningFromStage = await prisma.slaClock.findMany({
    where: { claimId, status: 'RUNNING', slaTarget: { metricType: 'STAGE_TRANSITION', fromStatus } },
  });
  for (const clock of runningFromStage) {
    await prisma.slaClock.update({ where: { id: clock.id }, data: { status: 'SATISFIED', satisfiedAt: at } });
  }

  const claim = await prisma.claim.findUnique({ where: { id: claimId } });
  if (!claim?.slaPolicyId) return;
  const policy = await prisma.slaPolicy.findUnique({ where: { id: claim.slaPolicyId } });
  if (!policy || !policy.isActive) return;
  await startClaimStageClock(claimId, policy, toStatus, at);
}

/** PENDING_CUSTOMER/PENDING_CARRIER entry: pauses the Case's RUNNING RESOLUTION clock (FIRST_RESPONSE is unaffected — a hold doesn't excuse an agent from having already responded, or not, before the hold). */
export async function pauseCaseResolutionClock(caseId: string, at: Date = new Date()): Promise<void> {
  const prisma = getPrismaClient();
  const clocks = await prisma.slaClock.findMany({ where: { caseId, status: 'RUNNING', slaTarget: { metricType: 'RESOLUTION' } } });
  for (const clock of clocks) {
    await prisma.slaClock.update({ where: { id: clock.id }, data: { status: 'PAUSED', pausedAt: at } });
  }
}

/** Return-to-OPEN: resumes any PAUSED RESOLUTION clock, extending dueAt by the business minutes that elapsed while paused (so the pause doesn't count against the SLA), and accumulates totalPausedMinutes for reporting. */
export async function resumeCaseResolutionClock(caseId: string, at: Date = new Date()): Promise<void> {
  const prisma = getPrismaClient();
  const clocks = await prisma.slaClock.findMany({
    where: { caseId, status: 'PAUSED', slaTarget: { metricType: 'RESOLUTION' } },
    include: { slaTarget: { include: { slaPolicy: true } } },
  });
  for (const clock of clocks) {
    if (!clock.pausedAt) continue;
    const { calendar, holidays } = await loadCalendar(clock.slaTarget.slaPolicy.businessHoursCalendarId);
    const pausedBusinessMinutes = businessMinutesBetween(calendar, holidays, clock.pausedAt, at);
    const newDueAt = addBusinessMinutes(calendar, holidays, clock.dueAt, pausedBusinessMinutes);
    await prisma.slaClock.update({
      where: { id: clock.id },
      data: {
        status: 'RUNNING',
        pausedAt: null,
        dueAt: newDueAt,
        totalPausedMinutes: clock.totalPausedMinutes + Math.round(pausedBusinessMinutes),
      },
    });
  }
}

/** RESOLVED entry: satisfies any still-open (RUNNING or PAUSED — a case can be resolved directly out of a pending hold) RESOLUTION clock. */
export async function satisfyCaseResolutionClock(caseId: string, at: Date = new Date()): Promise<void> {
  const prisma = getPrismaClient();
  const clocks = await prisma.slaClock.findMany({ where: { caseId, status: { in: ['RUNNING', 'PAUSED'] }, slaTarget: { metricType: 'RESOLUTION' } } });
  for (const clock of clocks) {
    await prisma.slaClock.update({ where: { id: clock.id }, data: { status: 'SATISFIED', satisfiedAt: at, pausedAt: null } });
  }
}

/** First staff-authored, non-internal comment on a Case: satisfies the FIRST_RESPONSE clock. Idempotent — a no-op once already satisfied (no RUNNING clock left to match). */
export async function satisfyCaseFirstResponseClock(caseId: string, at: Date = new Date()): Promise<void> {
  const prisma = getPrismaClient();
  const clocks = await prisma.slaClock.findMany({ where: { caseId, status: 'RUNNING', slaTarget: { metricType: 'FIRST_RESPONSE' } } });
  for (const clock of clocks) {
    await prisma.slaClock.update({ where: { id: clock.id }, data: { status: 'SATISFIED', satisfiedAt: at } });
  }
}
