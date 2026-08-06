/** Local copy of app/(knowledge)/_lib/format.ts's date helpers — see that
 * file's header comment for why route groups each keep their own. */

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

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: string | null | undefined, currency: string): string {
  if (!value) return '—';
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return '—';
  let formatter = currencyFormatterCache.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 });
    currencyFormatterCache.set(currency, formatter);
  }
  return formatter.format(amount);
}
