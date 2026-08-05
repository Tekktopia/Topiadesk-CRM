/** Formatting helpers shared across app/(knowledge)/** views — mirrors
 * app/(crm)/_lib/format.ts's date helpers (local copy for the same
 * cross-route-group isolation reason as _lib/api.ts's header comment). */

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
