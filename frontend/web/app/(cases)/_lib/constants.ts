import {
  ASSIGNMENT_STRATEGIES,
  CASE_MANAGEMENT_ENTITY_TYPES,
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_TYPES,
  CLAIM_STATUSES,
  MACRO_ACTION_TYPES,
  SLA_METRIC_TYPES,
  WEEKDAY_KEYS,
  type CasePriority,
  type CaseStatus,
  type CaseType,
  type ClaimStatus,
  type WeeklyHours,
} from './types';

export {
  ASSIGNMENT_STRATEGIES,
  CASE_MANAGEMENT_ENTITY_TYPES,
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_TYPES,
  CLAIM_STATUSES,
  MACRO_ACTION_TYPES,
  SLA_METRIC_TYPES,
  WEEKDAY_KEYS,
};

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline';

export const humanize = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');

export function claimStatusLabel(status: ClaimStatus | string): string {
  return humanize(status);
}
export function claimStatusVariant(status: ClaimStatus | string): BadgeVariant {
  switch (status) {
    case 'NOTIFIED':
      return 'secondary';
    case 'UNDER_REVIEW':
      return 'warning';
    case 'ADJUSTED':
      return 'default';
    case 'SETTLED':
      return 'success';
    case 'REPUDIATED':
      return 'destructive';
    case 'REOPENED':
      return 'warning';
    case 'WITHDRAWN':
      return 'outline';
    default:
      return 'outline';
  }
}

export function caseStatusLabel(status: CaseStatus | string): string {
  return humanize(status);
}
export function caseStatusVariant(status: CaseStatus | string): BadgeVariant {
  switch (status) {
    case 'NEW':
      return 'secondary';
    case 'OPEN':
      return 'default';
    case 'PENDING_CUSTOMER':
    case 'PENDING_CARRIER':
      return 'warning';
    case 'RESOLVED':
      return 'success';
    case 'CLOSED':
      return 'outline';
    case 'REOPENED':
      return 'warning';
    default:
      return 'outline';
  }
}
/** PENDING_CUSTOMER/PENDING_CARRIER are a real differentiator (see case-lifecycle.ts's doc comment) — different escalation paths, independent SlaClock pauses. Surfaced as a short subtitle under the status badge rather than folded into the label alone. */
export function caseStatusPendingDescription(status: CaseStatus | string): string | null {
  if (status === 'PENDING_CUSTOMER') return 'Waiting on the customer to respond';
  if (status === 'PENDING_CARRIER') return 'Waiting on the carrier to respond';
  return null;
}

export function casePriorityLabel(priority: CasePriority | string): string {
  return humanize(priority);
}
export function casePriorityVariant(priority: CasePriority | string): BadgeVariant {
  switch (priority) {
    case 'LOW':
      return 'outline';
    case 'MEDIUM':
      return 'secondary';
    case 'HIGH':
      return 'warning';
    case 'URGENT':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function caseTypeLabel(caseType: CaseType | string): string {
  return humanize(caseType);
}

export function macroActionTypeLabel(actionType: string): string {
  return humanize(actionType);
}

const WEEKDAY_SHORT_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

/** Short "Mon–Fri" style summary of a BusinessHoursCalendar.weeklyHours for list-view display — collapses a run of consecutive open days sharing the same start/end into one range, comma-separates otherwise. Closed calendar reads "Closed all week". */
export function summarizeWeeklyHours(hours: WeeklyHours): string {
  const openDays = WEEKDAY_KEYS.filter((day) => hours[day]);
  if (openDays.length === 0) return 'Closed all week';

  const segments: string[] = [];
  let runStart = openDays[0]!;
  let runPrev = openDays[0]!;
  const windowOf = (day: (typeof WEEKDAY_KEYS)[number]) => hours[day];
  const sameWindow = (a: (typeof WEEKDAY_KEYS)[number], b: (typeof WEEKDAY_KEYS)[number]) => {
    const wa = windowOf(a);
    const wb = windowOf(b);
    return wa?.start === wb?.start && wa?.end === wb?.end;
  };

  function flushRun() {
    const label = runStart === runPrev ? WEEKDAY_SHORT_LABEL[runStart] : `${WEEKDAY_SHORT_LABEL[runStart]}–${WEEKDAY_SHORT_LABEL[runPrev]}`;
    const w = windowOf(runStart);
    segments.push(w ? `${label} ${w.start}–${w.end}` : `${label}`);
  }

  for (let i = 1; i < openDays.length; i++) {
    const day = openDays[i]!;
    const prevIndex = WEEKDAY_KEYS.indexOf(runPrev);
    const isConsecutive = WEEKDAY_KEYS.indexOf(day) === prevIndex + 1;
    if (isConsecutive && sameWindow(day, runPrev)) {
      runPrev = day;
    } else {
      flushRun();
      runStart = day;
      runPrev = day;
    }
  }
  flushRun();

  return segments.join(', ');
}
