/**
 * Computes `RenewalSchedule.nextAlertDueAt` whenever a schedule is created
 * or its `renewalDueDate`/`alertThresholds` are overridden via the API —
 * the client supplies the inputs (due date, thresholds), not the derived
 * scan-column value itself, so it can never desync from what the worker's
 * scan (backend/worker/src/jobs/renewal-alerts/threshold.ts) expects to
 * find. Mirrors that file's date math (UTC-midnight granularity) but is
 * intentionally a separate small copy, not a shared import — api and
 * worker are independently deployable apps with no shared code package for
 * this, and the two functions solve different problems (this picks the
 * FIRST upcoming threshold date; the worker's nextAlertDate advances PAST
 * one already fired).
 */
function addDays(date: Date, days: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * The soonest date among {renewalDueDate - threshold} that is still today
 * or later. If every threshold's alert date has already passed (renewal is
 * imminent or overdue relative to the smallest configured threshold), falls
 * back to `now` — the worker's next scan tick (within ~15 min) will then
 * pick it up immediately and fire the smallest-threshold alert, rather than
 * this endpoint silently scheduling nothing.
 */
export function computeInitialNextAlertDueAt(renewalDueDate: Date, thresholds: number[], now: Date = new Date()): Date {
  const today = startOfUtcDay(now);
  const candidates = thresholds
    .map((t) => addDays(renewalDueDate, -t))
    .filter((d) => d.getTime() >= today.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? now;
}
