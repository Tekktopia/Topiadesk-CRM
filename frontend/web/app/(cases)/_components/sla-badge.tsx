'use client';

import { Badge } from '@topiadesk/ui';
import { formatDateTime, summarizeSlaClocks } from '../_lib/format';
import type { SlaClock } from '../_lib/types';

/**
 * Compact "Due in 2h" / "Breached" / "Paused" / "SLA met" pill for a table
 * row — see summarizeSlaClocks's doc comment for the reduction logic.
 * Renders nothing (not even a placeholder) when there's no clock data,
 * which is the common case for an ACCOUNT_HANDLER/MANAGER viewer (see
 * hooks.ts's useSlaClocksByPolicyIds doc comment on the 'sla_config'
 * permission gate) — a blank cell there is honest; a fake "—" would imply
 * "this case has no SLA" when the truth is "you can't see it".
 */
export function SlaBadge({ clocks }: { clocks: SlaClock[] | undefined }) {
  const info = summarizeSlaClocks(clocks);
  if (!info) return null;
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

/** One labeled clock line for a detail view (e.g. "First response — Due in 2h, by Aug 5, 3:00 PM"). Renders nothing if `clock` is null (that stage's target isn't configured on this record's SlaPolicy). */
export function SlaClockRow({ label, clock }: { label: string; clock: SlaClock | null }) {
  if (!clock) return null;
  const info = summarizeSlaClocks([clock]);
  const timestamp = clock.status === 'BREACHED' && clock.breachedAt ? `breached ${formatDateTime(clock.breachedAt)}` : `by ${formatDateTime(clock.dueAt)}`;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{timestamp}</span>
        {info ? <Badge variant={info.variant}>{info.label}</Badge> : null}
      </span>
    </div>
  );
}
