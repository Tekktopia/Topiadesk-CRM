'use client';

import * as React from 'react';
import { CalendarRange, Target, Users, Wallet } from 'lucide-react';
import { StatsStrip } from './stats-strip';
import { formatCurrency } from '../_lib/format';
import type { SalesQuotaStats } from '../_lib/types';

/**
 * Quota-coverage KPI strip.
 *
 * "In force" is the number that matters, not the raw total: a quota whose
 * period has already ended is history, and mixing expired targets into a
 * headline figure would overstate what the team is actually carrying. The
 * money tile sums only those in-force targets for the same reason.
 *
 * Attainment is deliberately absent. Computing it org-wide means re-running
 * the per-quota won-opportunity scan once per quota — a page-load cost that
 * grows with the team. It stays on the per-quota attainment dialog, where
 * one scan answers the question the user actually asked.
 */
export function SalesQuotaStatsStrip({ stats, isLoading }: { stats: SalesQuotaStats | undefined; isLoading: boolean }) {
  const tiles = stats
    ? [
        {
          label: 'Quotas in force',
          value: stats.current.toLocaleString(),
          icon: <CalendarRange aria-hidden />,
          description: `${stats.total.toLocaleString()} defined in this view`,
        },
        {
          label: 'Target in force',
          value: formatCurrency(Number(stats.currentTargetTotal)),
          icon: <Wallet aria-hidden />,
          description: 'Summed across live periods',
        },
        {
          label: 'Individual quotas',
          value: stats.individual.toLocaleString(),
          icon: <Users aria-hidden />,
          description: 'Assigned to a named rep',
        },
        {
          label: 'Team & org quotas',
          value: (stats.total - stats.individual).toLocaleString(),
          icon: <Target aria-hidden />,
          description: 'Department, branch, or org-wide',
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}
