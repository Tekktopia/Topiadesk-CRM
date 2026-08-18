'use client';

import * as React from 'react';
import { Banknote, FolderOpen, RotateCcw, ShieldAlert } from 'lucide-react';
import { StatsStrip } from '../../(crm)/_components/stats-strip';
import type { ClaimStats } from '../_lib/types';

/** Mirrors formatCurrency in (crm)/_lib/format without importing across the group for one helper. */
function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Claims-desk KPI strip.
 *
 * Outstanding reserve and total settled are separate tiles on purpose:
 * reserve is money set aside against live claims (exposure that could still
 * move), settled is money already paid out. Adding them together would be a
 * number that means nothing. Reserve counts only OPEN claims — a settled
 * claim's leftover reserve is not exposure.
 *
 * Both are labelled with the base currency the API converted into, since the
 * underlying policies can be written in several.
 */
export function ClaimStatsStrip({ stats, isLoading }: { stats: ClaimStats | undefined; isLoading: boolean }) {
  const tiles = stats
    ? [
        {
          label: 'Open claims',
          value: stats.open.toLocaleString(),
          icon: <FolderOpen aria-hidden />,
          description: `${stats.total.toLocaleString()} in this view`,
        },
        {
          label: 'Outstanding reserve',
          value: money(stats.outstandingReserve, stats.baseCurrency),
          icon: <ShieldAlert aria-hidden />,
          description: 'Set aside against open claims',
        },
        {
          label: 'Settled',
          value: money(stats.totalSettled, stats.baseCurrency),
          icon: <Banknote aria-hidden />,
          description: `${stats.settled.toLocaleString()} paid · ${stats.repudiated.toLocaleString()} repudiated`,
        },
        {
          label: 'Reopened',
          value: stats.reopened.toLocaleString(),
          icon: <RotateCcw aria-hidden />,
          description: stats.reopened > 0 ? 'Closed once, now live again' : 'None reopened',
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}
