/**
 * Pure date/threshold math for the renewal-alert scan — no I/O, so it's
 * cheap to reason about and unit-test in isolation from Postgres/Redis.
 * All date math is done at UTC-midnight granularity; RenewalSchedule.
 * renewalDueDate is a Prisma `@db.Date` (no time component).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`, ignoring time-of-day. Negative if `to` is in the past. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / MS_PER_DAY);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * YYYY-MM-DD (UTC) — the dedupeKey's date bucket, so re-running the scan
 * repeatedly within the same day (it runs every ~15 minutes) never produces
 * a second Notification for the same threshold: Notification.dedupeKey has
 * a unique constraint, and a P2002 on this key is caught as a no-op (see
 * renewal-scan.job.ts). Advancing nextAlertDueAt past today is what stops
 * the schedule being re-selected on the NEXT day for the same threshold —
 * the date bucket alone only guards same-day re-runs.
 */
export function dateBucket(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Which configured alert threshold (days-out) the current scan represents
 * for a given renewal. Picks the SMALLEST threshold still >= daysUntilRenewal
 * — e.g. thresholds [90,60,30,7] with 44 days left resolves to 60 (we've
 * already passed the 90-day mark without the schedule being checked, but
 * are not yet inside the 30-day window). If daysUntilRenewal is smaller than
 * every configured threshold (deep inside the tightest window, or the
 * renewal is already overdue), falls back to the smallest threshold — there
 * is always a "final" alert to send.
 */
export function applicableThreshold(thresholds: number[], daysUntilRenewal: number): number {
  if (thresholds.length === 0) throw new Error('alertThresholds must not be empty');
  const notYetCrossed = thresholds.filter((t) => t >= daysUntilRenewal);
  return notYetCrossed.length > 0 ? Math.min(...notYetCrossed) : Math.min(...thresholds);
}

/**
 * The next `nextAlertDueAt` to persist after successfully handling
 * `firedThreshold` — the calendar date of the next SMALLER configured
 * threshold, so the scan's `WHERE nextAlertDueAt <= now()` filter won't
 * re-select this schedule until that day arrives. Returns null when
 * `firedThreshold` was already the smallest configured threshold (nothing
 * left to pre-schedule) — callers fall back to "check again tomorrow".
 */
export function nextAlertDate(renewalDueDate: Date, thresholds: number[], firedThreshold: number): Date | null {
  const smaller = thresholds.filter((t) => t < firedThreshold);
  if (smaller.length === 0) return null;
  const nextThreshold = Math.max(...smaller);
  return addDays(renewalDueDate, -nextThreshold);
}
