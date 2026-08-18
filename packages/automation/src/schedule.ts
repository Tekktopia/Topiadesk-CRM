/**
 * Cadence for SCHEDULE rules.
 *
 * `AutomationTriggerType.SCHEDULE` has existed in the enum since the module
 * was written, but `AutomationRule` carried no column saying *when* — no
 * cron, no interval, nothing — and no job ever looked for such rules. The
 * admin screen said so in its own description text. So a rule created there
 * was stored, listed, badged Active, and never ran. This module supplies the
 * missing half: an expression, a timezone, and the arithmetic that turns them
 * into the next due instant.
 *
 * Timezone is a real requirement rather than a nicety. "Every weekday at 9am"
 * means 9am where the broker sits; a Lagos firm running renewal chasers on
 * UTC would send them at 8am local, and during a DST-observing counterparty's
 * summer the drift changes mid-year. cron-parser resolves the expression in a
 * named IANA zone, so the stored `nextRunAt` is a correct absolute instant.
 */

import { CronExpressionParser } from 'cron-parser';

/**
 * Everyday cadences, so the common case never requires knowing cron.
 *
 * The builder offers these as a dropdown and only reveals the raw expression
 * field for CUSTOM — an admin setting up an SLA chaser should not have to
 * work out that `0 * * * *` is hourly.
 */
export const SCHEDULE_PRESETS = {
  EVERY_15_MINUTES: { label: 'Every 15 minutes', cron: '*/15 * * * *' },
  HOURLY: { label: 'Every hour', cron: '0 * * * *' },
  EVERY_4_HOURS: { label: 'Every 4 hours', cron: '0 */4 * * *' },
  DAILY_8AM: { label: 'Every day at 8:00', cron: '0 8 * * *' },
  DAILY_6PM: { label: 'Every day at 18:00', cron: '0 18 * * *' },
  WEEKDAYS_8AM: { label: 'Weekdays at 8:00', cron: '0 8 * * 1-5' },
  WEEKLY_MONDAY_8AM: { label: 'Mondays at 8:00', cron: '0 8 * * 1' },
  MONTHLY_FIRST_8AM: { label: 'First of the month at 8:00', cron: '0 8 1 * *' },
} as const;

export type SchedulePreset = keyof typeof SCHEDULE_PRESETS;

export const DEFAULT_SCHEDULE_TIMEZONE = 'UTC';

/**
 * Floor on how often a scheduled rule may fire.
 *
 * The scan job itself wakes every 5 minutes, so anything finer would be a
 * promise the runtime cannot keep — better to reject it at save time than to
 * let an admin believe a rule runs every minute when it cannot.
 */
export const MIN_SCHEDULE_INTERVAL_MS = 5 * 60_000;

export interface CronValidationResult {
  valid: boolean;
  error?: string;
  /** The next few firings, so the builder can show the admin what they just described. */
  preview?: string[];
}

export function validateCron(cron: string, timezone: string): CronValidationResult {
  if (!cron || cron.trim().length === 0) return { valid: false, error: 'Enter how often this rule should run.' };
  let interval;
  try {
    interval = CronExpressionParser.parse(cron.trim(), { currentDate: new Date(), tz: timezone });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `That schedule isn't valid: ${message}` };
  }

  const preview: string[] = [];
  let previous: Date | undefined;
  let tightest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 5; i += 1) {
    try {
      const next = interval.next().toDate();
      if (previous) tightest = Math.min(tightest, next.getTime() - previous.getTime());
      previous = next;
      preview.push(next.toISOString());
    } catch {
      break;
    }
  }

  if (preview.length < 2) return { valid: false, error: 'That schedule never repeats.' };
  if (tightest < MIN_SCHEDULE_INTERVAL_MS) {
    return { valid: false, error: 'The shortest supported interval is 5 minutes.' };
  }
  return { valid: true, preview };
}

/**
 * The next instant this rule is due, strictly after `after`.
 *
 * Returns null for an unparseable expression rather than throwing: a single
 * corrupt row must not take down the scan that serves every other rule. The
 * caller records the parse failure on the rule so the admin can see why it
 * stopped running, which is far more useful than a crashed worker.
 */
export function computeNextRunAt(cron: string, timezone: string, after: Date): Date | null {
  try {
    const interval = CronExpressionParser.parse(cron.trim(), { currentDate: after, tz: timezone || DEFAULT_SCHEDULE_TIMEZONE });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

/** Plain-English cadence for list rows, so nobody has to read cron to know what a rule does. */
export function describeCron(cron: string, timezone: string): string {
  const preset = Object.values(SCHEDULE_PRESETS).find((p) => p.cron === cron);
  const zone = timezone && timezone !== DEFAULT_SCHEDULE_TIMEZONE ? ` (${timezone})` : '';
  if (preset) return `${preset.label}${zone}`;
  return `${cron}${zone}`;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
