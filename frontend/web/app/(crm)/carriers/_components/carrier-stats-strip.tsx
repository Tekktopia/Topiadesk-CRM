'use client';

import * as React from 'react';
import { Ban, Building, FileText, ShieldCheck } from 'lucide-react';
import { StatsStrip } from '../../_components/stats-strip';
import { formatCurrency } from '../../_lib/format';
import type { CarrierStats } from '../../_lib/types';

/**
 * Carriers KPI strip — panel composition and the book placed with it.
 *
 * Deliberately NOT a rating of any one market: that is the per-carrier
 * scorecard (bind ratio / response time / loss ratio) on the detail page.
 * This is the "what does our panel look like" view a broker reports upward.
 *
 * Premium is labelled with the base currency the API converted into, since
 * the underlying policies can be written in several.
 */
export function CarrierStatsStrip({ stats, isLoading }: { stats: CarrierStats | undefined; isLoading: boolean }) {
  const tiles = stats
    ? [
        {
          label: 'Carriers',
          value: stats.total.toLocaleString(),
          icon: <Building aria-hidden />,
          description: `${stats.prospective.toLocaleString()} still prospective`,
        },
        {
          label: 'Active on panel',
          value: stats.activeOnPanel.toLocaleString(),
          icon: <ShieldCheck aria-hidden />,
          description: 'Cleared to take new business',
        },
        {
          label: 'Off panel',
          value: stats.offPanel.toLocaleString(),
          icon: <Ban aria-hidden />,
          description: stats.offPanel > 0 ? 'Suspended or terminated' : 'Nothing suspended',
        },
        {
          label: 'Premium placed',
          value: formatCurrency(String(stats.totalGrossPremium), stats.baseCurrency),
          icon: <FileText aria-hidden />,
          description: `Across ${stats.policiesPlaced.toLocaleString()} ${stats.policiesPlaced === 1 ? 'policy' : 'policies'}`,
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}
