'use client';

import * as React from 'react';
import { AlarmClock, Inbox, TicketCheck, UserX } from 'lucide-react';
// Cross-route-group import: StatsStrip is generic presentation with no CRM
// coupling, and this codebase already crosses these boundaries deliberately
// (admin's workflow-builder imports (cases)/_lib/hooks). Copying it a sixth
// time would be worse than the import.
import { StatsStrip } from '../../(crm)/_components/stats-strip';
import type { CaseStats } from '../_lib/types';

/**
 * Ticket-desk KPI strip.
 *
 * The two tiles that matter operationally are Unassigned and Breaching:
 * work nobody owns, and work already past its SLA. Both are computed
 * server-side over the same filter as the list — breach state lives on
 * SlaClock and is not derivable from the ticket rows the table renders.
 */
export function CaseStatsStrip({ stats, isLoading }: { stats: CaseStats | undefined; isLoading: boolean }) {
  const tiles = stats
    ? [
        {
          label: 'Open tickets',
          value: stats.open.toLocaleString(),
          icon: <Inbox aria-hidden />,
          description: `${stats.newCount.toLocaleString()} still untriaged`,
        },
        {
          label: 'Unassigned',
          value: stats.unassigned.toLocaleString(),
          icon: <UserX aria-hidden />,
          description: stats.unassigned > 0 ? 'Open with nobody assigned' : 'Everything has an owner',
        },
        {
          label: 'Breaching SLA',
          value: stats.breaching.toLocaleString(),
          icon: <AlarmClock aria-hidden />,
          description: stats.breaching > 0 ? 'Past due on a running clock' : 'No clocks past due',
        },
        {
          label: 'Resolved',
          value: stats.resolved.toLocaleString(),
          icon: <TicketCheck aria-hidden />,
          description: `${stats.closed.toLocaleString()} closed · ${stats.total.toLocaleString()} in this view`,
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}
