/** Formatting helpers shared across app/(cases)/** views — mirrors app/(crm)/_lib/format.ts. */

import type { BadgeVariant } from './constants';
import type { SlaClock } from './types';

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

/** "2h", "45m", "3d" — coarse duration for a due-in/overdue-by badge label. Never seconds-precision; this drives a glanceable pill, not a countdown timer. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export interface SlaBadgeInfo {
  label: string;
  variant: BadgeVariant;
}

/**
 * Reduces a set of SlaClock rows (all of them belonging to one Case or one
 * Claim — FIRST_RESPONSE+RESOLUTION for a Case, the current STAGE_TRANSITION
 * for a Claim) to a single glanceable badge: the worst/most-urgent status
 * wins. Returns null when there's nothing to show (no clocks at all — e.g.
 * no SlaPolicy resolved for this record), which callers render as no badge,
 * not an empty/placeholder one.
 */
export function summarizeSlaClocks(clocks: SlaClock[] | undefined, now: Date = new Date()): SlaBadgeInfo | null {
  if (!clocks || clocks.length === 0) return null;

  const breached = clocks.some((c) => c.status === 'BREACHED');
  if (breached) return { label: 'Breached', variant: 'destructive' };

  const running = clocks.filter((c) => c.status === 'RUNNING');
  if (running.length > 0) {
    const soonest = running.reduce((a, b) => (new Date(a.dueAt).getTime() < new Date(b.dueAt).getTime() ? a : b));
    const diffMs = new Date(soonest.dueAt).getTime() - now.getTime();
    if (diffMs <= 0) {
      // Overdue but the breach-scan job (backend/worker/src/jobs/...) hasn't
      // flipped the clock's status yet — still worth flagging as urgent.
      return { label: `Overdue ${formatDuration(diffMs)}`, variant: 'destructive' };
    }
    const label = `Due in ${formatDuration(diffMs)}`;
    return { label, variant: diffMs < 4 * 60 * 60_000 ? 'warning' : 'secondary' };
  }

  if (clocks.some((c) => c.status === 'PAUSED')) return { label: 'Paused', variant: 'outline' };

  // Everything left is SATISFIED.
  return { label: 'SLA met', variant: 'success' };
}
