import type { ScheduledReportFrequency } from '@topiadesk/db';

/**
 * Pure date math, unit-testable in isolation — mirrors renewal-alerts/
 * threshold.ts's split of "when is the next occurrence" out of the job
 * body. All computation is in UTC (hourOfDayUtc is the schema's own name
 * for the column), so there is no local-timezone ambiguity across
 * container restarts in a different TZ.
 */
export function computeNextRunAt(
  frequency: ScheduledReportFrequency,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  hourOfDayUtc: number,
  from: Date,
): Date {
  const next = new Date(from);
  next.setUTCHours(hourOfDayUtc, 0, 0, 0);

  switch (frequency) {
    case 'DAILY': {
      if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }
    case 'WEEKLY': {
      const targetDow = dayOfWeek ?? 0;
      while (next.getUTCDay() !== targetDow || next <= from) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      return next;
    }
    case 'MONTHLY': {
      const targetDom = dayOfMonth ?? 1;
      next.setUTCDate(1);
      setClampedDate(next, targetDom);
      if (next <= from) {
        next.setUTCMonth(next.getUTCMonth() + 1, 1);
        setClampedDate(next, targetDom);
      }
      return next;
    }
    case 'QUARTERLY': {
      const targetDom = dayOfMonth ?? 1;
      next.setUTCDate(1);
      setClampedDate(next, targetDom);
      while (next <= from) {
        next.setUTCMonth(next.getUTCMonth() + 3, 1);
        setClampedDate(next, targetDom);
      }
      return next;
    }
  }
}

/** Clamps to the last real day of the month — e.g. dayOfMonth=31 in a 30-day month lands on the 30th rather than overflowing into the next month. */
function setClampedDate(date: Date, dayOfMonth: number): void {
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(Math.max(1, dayOfMonth), daysInMonth));
}
