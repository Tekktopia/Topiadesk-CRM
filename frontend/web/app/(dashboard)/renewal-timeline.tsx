'use client';

import Link from 'next/link';
import { Badge, cn } from '@topiadesk/ui';
import { daysUntil, formatDate, renewalStatusVariant } from '@/app/(policy)/lib/format';
import type { RenewalRow } from './types';

const HORIZON_DAYS = 90;

/**
 * Renewal timeline — each policy due for renewal plotted on a shared 0–90
 * day axis (a compact Gantt-style position marker, not a full calendar
 * grid, which would be disproportionate real estate for a dashboard
 * widget). Marker color is a status read (overdue/at-risk/on-track), not
 * an arbitrary categorical hue — the reserved destructive/warning/primary
 * tokens, matching the dataviz skill's "status colors carry state" rule.
 * Backed by app/api/dashboard/renewals (composed from GET /policies + a
 * per-policy GET .../renewal-schedule fan-out — see that route's comment
 * for why there's no single backend listing endpoint for this).
 */
export function RenewalTimeline({ renewals }: { renewals: RenewalRow[] }) {
  if (renewals.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No renewals scheduled.</div>;
  }

  const visible = renewals.slice(0, 8);
  const overflow = renewals.length - visible.length;

  return (
    <div className="space-y-3">
      <ul className="space-y-3" aria-label="Upcoming policy renewals">
        {visible.map((renewal) => {
          const days = daysUntil(renewal.renewalDueDate);
          const overdue = days < 0;
          const urgent = !overdue && days <= 30;
          const markerColor = overdue ? 'bg-destructive' : urgent ? 'bg-warning' : 'bg-primary';
          const positionPercent = Math.min(100, Math.max(0, (Math.max(days, 0) / HORIZON_DAYS) * 100));

          return (
            <li key={renewal.policyId}>
              <Link
                href={`/policies/${renewal.policyId}`}
                className="block rounded-md p-1.5 -m-1.5 transition-colors hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{renewal.policyNumber}</span>
                  <span className={cn('whitespace-nowrap text-xs font-medium', overdue && 'text-destructive', urgent && 'text-warning')}>
                    {overdue ? `${Math.abs(days)}d overdue` : `in ${days}d`}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {renewal.accountName} · {renewal.lineOfBusiness}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="relative h-1.5 flex-1 rounded-none bg-muted">
                    <span
                      className={cn('absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-none ring-2 ring-background', markerColor)}
                      style={{ left: `calc(${positionPercent}% - 5px)` }}
                    />
                  </div>
                  <Badge variant={renewalStatusVariant(renewal.renewalStatus)} className="shrink-0">
                    {renewal.renewalStatus.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Due {formatDate(renewal.renewalDueDate)}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      {overflow > 0 ? <p className="text-xs text-muted-foreground">+{overflow} more due within 90 days.</p> : null}
    </div>
  );
}
