'use client';

import * as React from 'react';
import { AlertTriangle, Scale, Target, Wallet } from 'lucide-react';
import { StatsStrip } from '../../_components/stats-strip';
import { formatCurrency } from '../../_lib/format';
import type { OpportunityStats } from '../../_lib/types';

/**
 * Pipeline KPI strip. Layout comes from the shared StatsStrip.
 *
 * Every money tile is labelled with the base currency the stats endpoint
 * returns rather than a hardcoded symbol: the underlying deals are
 * multi-currency and the API converts them via ExchangeRate, so the tile
 * must state which currency the converted total is actually in.
 */
export function PipelineStatsStrip({ stats, isLoading }: { stats: OpportunityStats | undefined; isLoading: boolean }) {
  const money = (value: number): string => formatCurrency(String(value), stats?.baseCurrency ?? 'NGN');

  const tiles = stats
    ? [
        {
          label: 'Open pipeline',
          value: money(stats.openValue),
          icon: <Wallet aria-hidden />,
          description: `${stats.openCount.toLocaleString()} open ${stats.openCount === 1 ? 'deal' : 'deals'}`,
        },
        {
          label: 'Weighted forecast',
          value: money(stats.weightedValue),
          icon: <Scale aria-hidden />,
          description: 'Open value x probability',
        },
        {
          label: 'Win rate',
          value: `${stats.winRate}%`,
          icon: <Target aria-hidden />,
          description: `${stats.wonCount.toLocaleString()} won / ${stats.lostCount.toLocaleString()} lost`,
        },
        {
          label: 'Average deal size',
          value: money(stats.averageDealSize),
          icon: <AlertTriangle aria-hidden />,
          description:
            stats.overdueCount > 0
              ? `${stats.overdueCount.toLocaleString()} past expected close`
              : 'Nothing past expected close',
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}
