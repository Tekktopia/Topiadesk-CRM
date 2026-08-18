'use client';

import * as React from 'react';
import { Briefcase, Layers, ToggleLeft, Wallet } from 'lucide-react';
import { StatsStrip } from '../../_components/stats-strip';
import { formatCurrency } from '../../_lib/format';
import type { Pipeline, PipelineStage, PipelineUsage } from '../../_lib/types';

/**
 * Config-page KPI strip — deliberately NOT the "records matching a filter"
 * strip the list pages use, because there is nothing to filter here.
 *
 * What matters on a config screen is blast radius: this page's own
 * description says changes "reshape the Pipeline board immediately for every
 * user", so the tiles answer "how much live work is riding on the thing I am
 * about to edit". The last two tiles are scoped to the SELECTED pipeline for
 * that reason, not to the whole org.
 */
export function PipelineSetupStatsStrip({
  pipelines,
  selected,
  stages,
  usage,
  isLoading,
}: {
  pipelines: Pipeline[];
  selected: Pipeline | null;
  stages: PipelineStage[];
  usage: PipelineUsage | undefined;
  isLoading: boolean;
}) {
  const activeCount = pipelines.filter((p) => p.isActive).length;

  const tiles = [
    {
      label: 'Pipelines',
      value: pipelines.length,
      icon: <Layers aria-hidden />,
      description: `${activeCount} active, ${pipelines.length - activeCount} inactive`,
    },
    {
      label: 'Status',
      value: selected?.isActive ? 'Active' : selected ? 'Inactive' : '—',
      icon: <ToggleLeft aria-hidden />,
      description: selected ? selected.name : 'No pipeline selected',
    },
    {
      label: 'Stages',
      value: stages.length,
      icon: <Briefcase aria-hidden />,
      description: selected ? `In ${selected.name}` : 'No pipeline selected',
    },
    {
      label: 'Deals riding on it',
      value: usage ? usage.totalOpportunities.toLocaleString() : '—',
      icon: <Wallet aria-hidden />,
      description: usage
        ? `${formatCurrency(String(usage.totalValue), usage.baseCurrency)} across these stages`
        : 'Loading usage…',
    },
  ];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}
