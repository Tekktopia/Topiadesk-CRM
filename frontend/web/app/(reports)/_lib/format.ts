/**
 * Value/label formatting for report results — pure functions only (no
 * hooks/browser APIs), same convention as app/(policy)/lib/format.ts.
 * Report cell values arrive already-numeric (SUM/COUNT/AVG results — see
 * e.g. packages/reports/src/definitions/premium-aging-by-branch.ts's
 * `::float8`/`::int` casts), unlike Policy/Premium amounts which cross the
 * API as Decimal-safe strings, so these formatters accept `number` first
 * and only fall back to `Number(...)` for the rare string cell.
 */
import type { ReportCellValue, ReportValueFormat } from './types';

const nairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat('en-NG');
const dateFormatter = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function toNumber(value: ReportCellValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatReportValue(format: ReportValueFormat, value: ReportCellValue): string {
  if (value === null || value === undefined) return '—';
  switch (format) {
    case 'currency': {
      const n = toNumber(value);
      return n === null ? '—' : nairaFormatter.format(n);
    }
    case 'number': {
      const n = toNumber(value);
      return n === null ? '—' : numberFormatter.format(n);
    }
    case 'percent': {
      const n = toNumber(value);
      return n === null ? '—' : `${n.toFixed(1)}%`;
    }
    case 'days': {
      const n = toNumber(value);
      return n === null ? '—' : `${numberFormatter.format(n)} d`;
    }
    case 'date': {
      if (typeof value !== 'string') return '—';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
    }
    case 'text':
    default:
      return String(value);
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

/** camelCase filter key -> "Title Case" label, e.g. "lineOfBusiness" ->
 * "Line Of Business", "topN" -> "Top N" — used by the dynamic filter form
 * so field labels never have to be hand-maintained per report. */
export function humanizeKey(key: string): string {
  const withSpaces = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}
