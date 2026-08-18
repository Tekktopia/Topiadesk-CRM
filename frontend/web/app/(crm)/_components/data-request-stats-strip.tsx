'use client';

import * as React from 'react';
import { AlarmClock, CircleCheck, Hourglass, Inbox } from 'lucide-react';
import { StatsStrip } from './stats-strip';
import type { DataSubjectRequestStats } from '../_lib/types';

/**
 * Compliance-queue KPI strip.
 *
 * "Overdue" is the tile that matters: a request still pending past the
 * statutory response window is a regulatory breach, not a backlog item, and
 * it is the one number here that carries a legal consequence. "Due soon"
 * exists so that breach is preventable rather than merely reportable — the
 * two buckets are disjoint server-side, so they never double-count.
 *
 * The window length is read from the API rather than written into this copy,
 * so the wording can never drift from the constant the overdue count is
 * actually computed against.
 */
export function DataRequestStatsStrip({
  stats,
  isLoading,
}: {
  stats: DataSubjectRequestStats | undefined;
  isLoading: boolean;
}) {
  const tiles = stats
    ? [
        {
          label: 'Awaiting action',
          value: stats.pending.toLocaleString(),
          icon: <Inbox aria-hidden />,
          description: `${stats.total.toLocaleString()} logged in this view`,
        },
        {
          label: 'Overdue',
          value: stats.overdue.toLocaleString(),
          icon: <AlarmClock aria-hidden />,
          description:
            stats.overdue > 0
              ? `Past the ${stats.deadlineDays}-day response window`
              : `All inside the ${stats.deadlineDays}-day window`,
        },
        {
          label: 'Due soon',
          value: stats.dueSoon.toLocaleString(),
          icon: <Hourglass aria-hidden />,
          description: stats.dueSoon > 0 ? 'Deadline within a week' : 'Nothing closing in',
        },
        {
          label: 'Fulfilled',
          value: stats.completed.toLocaleString(),
          icon: <CircleCheck aria-hidden />,
          description: `${stats.rejected.toLocaleString()} rejected`,
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}
