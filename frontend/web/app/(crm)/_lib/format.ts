/** Formatting helpers shared across app/(crm)/** views. */

const currencyFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

/** Backend decimals are serialized as strings (e.g. "45000000.00"). */
export function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (Number.isNaN(value)) return '—';
  return currencyFormatter.format(value);
}

const dateFormatter = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

/** Coarse "time ago" for activity timelines — no date-fns dependency. */
export function formatRelativeTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);

  if (abs < 60) return diffSec >= 0 ? 'just now' : 'in a moment';
  const units: [number, string][] = [
    [60, 'minute'],
    [60, 'hour'],
    [24, 'day'],
    [7, 'week'],
    [4.345, 'month'],
    [12, 'year'],
  ];
  let value_ = abs / 60;
  let unit = 'minute';
  for (const [divisor, name] of units) {
    if (value_ < divisor) {
      unit = name;
      break;
    }
    value_ = value_ / divisor;
    unit = name;
  }
  const rounded = Math.round(value_);
  const plural = rounded === 1 ? unit : `${unit}s`;
  return diffSec >= 0 ? `${rounded} ${plural} ago` : `in ${rounded} ${plural}`;
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}
