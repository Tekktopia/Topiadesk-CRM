'use client';

import * as React from 'react';
import { Flame, Percent, Sparkles, Users } from 'lucide-react';
import { StatsStrip } from '../../_components/stats-strip';
import type { LeadStats } from '../../_lib/types';

/**
 * Leads KPI strip. Layout/skeletons/accents come from the shared StatsStrip;
 * this file only decides which four numbers matter for leads.
 *
 * These come from GET /crm/leads/stats, which applies the SAME filters as
 * the table — tiles that ignored the active filter would contradict the rows
 * directly beneath them.
 */
export function LeadStatsStrip({ stats, isLoading }: { stats: LeadStats | undefined; isLoading: boolean }) {
  const tiles = stats
    ? [
        {
          label: 'Total leads',
          value: stats.total.toLocaleString(),
          icon: <Users aria-hidden />,
          description: `${stats.createdLast7Days.toLocaleString()} added in the last 7 days`,
        },
        {
          label: 'Qualified',
          value: stats.qualified.toLocaleString(),
          icon: <Sparkles aria-hidden />,
          description: `${stats.newCount.toLocaleString()} still unworked`,
        },
        {
          label: 'Average score',
          value: stats.averageScore,
          icon: <Flame aria-hidden />,
          description: 'Across every lead in this view',
        },
        {
          label: 'Conversion rate',
          value: `${stats.conversionRate}%`,
          icon: <Percent aria-hidden />,
          description: `${stats.converted.toLocaleString()} converted to accounts`,
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}
