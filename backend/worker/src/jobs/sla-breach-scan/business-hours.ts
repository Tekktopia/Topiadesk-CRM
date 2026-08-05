/**
 * Business-hours-aware date math for the SLA engine. Pure and
 * dependency-free (no date-fns-tz / moment-timezone) — Node ships with full
 * ICU by default, so `Intl.DateTimeFormat` with a `timeZone` option already
 * gives correct IANA-timezone wall-clock conversion (including DST where
 * applicable) without adding a package.
 *
 * `BusinessHoursCalendar.weeklyHours` is untyped Json in the schema (no
 * further shape specified there) — `WeeklyHours` below is this module's own
 * contract for it. Every business-hours.controller.ts write goes through
 * the same shape.
 */

export interface DayWindow {
  /** "HH:mm", 24h, interpreted in the calendar's timezone. */
  start: string;
  end: string;
}

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** A day absent from the map (or `null`) is closed all day. One window per day — no split shifts, matching a brokerage's actual hours. */
export type WeeklyHours = Partial<Record<WeekdayKey, DayWindow | null>>;

export interface BusinessHoursCalendarLike {
  timezone: string;
  weeklyHours: WeeklyHours;
}

export interface BusinessHolidayLike {
  /** Calendar-day date (UTC midnight, as Prisma's @db.Date fields come back). */
  date: Date;
}

/** Same UTC calendar day (`BusinessHoliday.date` is a bare @db.Date — no time-of-day/timezone to reconcile). */
function isHoliday(date: Date, holidays: readonly BusinessHolidayLike[]): boolean {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  return holidays.some((h) => h.date.getUTCFullYear() === y && h.date.getUTCMonth() === m && h.date.getUTCDate() === d);
}

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: WeekdayKey;
}

const WEEKDAY_FROM_INTL: Record<string, WeekdayKey> = {
  Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat',
};

function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short',
  });
  const parts = fmt.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // hour12:false renders midnight as "24" in some ICU builds — normalize.
  const hour = get('hour') === '24' ? 0 : Number(get('hour'));
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY_FROM_INTL[get('weekday')] ?? 'mon',
  };
}

/**
 * Converts a "local" year/month/day/hour/minute in `timeZone` to the
 * corresponding UTC instant, by measuring that zone's current offset via a
 * round trip through Intl and correcting for it. Good enough for the
 * SLA engine's minute-granularity targets — does not attempt to handle the
 * (irrelevant for Africa/Lagos, this deployment's only calendar timezone
 * today) ambiguous/skipped local time near a DST transition.
 */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const naiveUtcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const zoned = getZonedParts(naiveUtcGuess, timeZone);
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  const offsetMs = zonedAsUtc - naiveUtcGuess.getTime();
  return new Date(naiveUtcGuess.getTime() - offsetMs);
}

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

/**
 * Adds `minutes` of business time to `from`, respecting the calendar's
 * weekly open windows and skipping holidays entirely (a holiday is treated
 * as fully closed, matching business_holidays' role as an override, not an
 * additional window). Used both to compute a fresh SlaClock.dueAt when a
 * clock starts, and to recompute dueAt when a clock resumes from
 * PENDING_CUSTOMER/PENDING_CARRIER (see sla-clock.util.ts on the API side —
 * same algorithm, duplicated there: backend/api and backend/worker are
 * separate deployable packages sharing only @topiadesk/db/@topiadesk/config
 * in this monorepo, so there is no in-repo import path from worker code
 * into api code or vice versa. Keep both copies in sync.
 *
 * Walks day-by-day (not minute-by-minute) advancing through open windows —
 * correct and fast enough for realistic SLA targets (minutes to low
 * thousands), with a hard cap so a misconfigured "never open" calendar
 * fails loudly instead of looping forever.
 */
export function addBusinessMinutes(
  calendar: BusinessHoursCalendarLike,
  holidays: readonly BusinessHolidayLike[],
  from: Date,
  minutes: number,
): Date {
  if (minutes <= 0) return new Date(from);

  let remaining = minutes;
  let cursor = new Date(from);
  const MAX_DAYS = 3650; // ~10 years — guards a calendar with no open days at all

  for (let dayOffset = 0; dayOffset <= MAX_DAYS; dayOffset++) {
    const parts = getZonedParts(cursor, calendar.timezone);
    const window = calendar.weeklyHours[parts.weekday];
    const dayIsOpen = window != null && !isHoliday(cursor, holidays);

    if (dayIsOpen) {
      const start = parseHm(window.start);
      const end = parseHm(window.end);
      const windowStart = zonedTimeToUtc(parts.year, parts.month, parts.day, start.h, start.m, calendar.timezone);
      const windowEnd = zonedTimeToUtc(parts.year, parts.month, parts.day, end.h, end.m, calendar.timezone);

      if (windowStart < windowEnd) {
        const sliceStart = cursor > windowStart ? cursor : windowStart;
        if (sliceStart < windowEnd) {
          const availableMinutes = (windowEnd.getTime() - sliceStart.getTime()) / 60_000;
          if (availableMinutes >= remaining) {
            return new Date(sliceStart.getTime() + remaining * 60_000);
          }
          remaining -= availableMinutes;
        }
      }
    }

    // Advance to the start of the next UTC calendar day in the target
    // timezone (midnight local), then let the next loop iteration re-derive
    // that day's window.
    const nextDayParts = getZonedParts(cursor, calendar.timezone);
    cursor = zonedTimeToUtc(nextDayParts.year, nextDayParts.month, nextDayParts.day + 1, 0, 0, calendar.timezone);
  }

  throw new Error(`addBusinessMinutes: calendar has no open business hours within ${MAX_DAYS} days of ${from.toISOString()}`);
}

/**
 * Business minutes elapsed between `from` and `to` — the inverse operation,
 * used to compute a clock's already-consumed time before a pause (so resume
 * can add only the *remaining* target minutes, not restart from zero).
 * Implemented by walking the same day-window logic forward from `from`
 * summing open-window overlap up to `to`.
 */
export function businessMinutesBetween(
  calendar: BusinessHoursCalendarLike,
  holidays: readonly BusinessHolidayLike[],
  from: Date,
  to: Date,
): number {
  if (to <= from) return 0;

  let total = 0;
  let cursor = new Date(from);
  const MAX_DAYS = 3650;

  for (let dayOffset = 0; dayOffset <= MAX_DAYS; dayOffset++) {
    if (cursor >= to) break;
    const parts = getZonedParts(cursor, calendar.timezone);
    const window = calendar.weeklyHours[parts.weekday];
    const dayIsOpen = window != null && !isHoliday(cursor, holidays);

    if (dayIsOpen) {
      const start = parseHm(window.start);
      const end = parseHm(window.end);
      const windowStart = zonedTimeToUtc(parts.year, parts.month, parts.day, start.h, start.m, calendar.timezone);
      const windowEnd = zonedTimeToUtc(parts.year, parts.month, parts.day, end.h, end.m, calendar.timezone);
      const sliceStart = cursor > windowStart ? cursor : windowStart;
      const sliceEnd = to < windowEnd ? to : windowEnd;
      if (sliceStart < sliceEnd) {
        total += (sliceEnd.getTime() - sliceStart.getTime()) / 60_000;
      }
    }

    const nextDayParts = getZonedParts(cursor, calendar.timezone);
    cursor = zonedTimeToUtc(nextDayParts.year, nextDayParts.month, nextDayParts.day + 1, 0, 0, calendar.timezone);
  }

  return total;
}
