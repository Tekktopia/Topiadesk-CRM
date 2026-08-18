'use client';

import * as React from 'react';
import { Asterisk, Boxes, EyeOff, ListChecks } from 'lucide-react';
import { StatsStrip } from './stats-strip';
import type { CustomFieldDefinitionStats } from '../_lib/types';

/**
 * Custom-schema KPI strip.
 *
 * "Required" is the tile that carries a real cost: every active required
 * field is one more thing a user cannot skip before saving an account,
 * contact, lead or opportunity, so it is worth seeing the running total
 * before adding another. Deactivated fields are counted separately rather
 * than hidden — they are soft-deleted (never dropped), so they still explain
 * jsonb values sitting on live records.
 */
export function CustomFieldStatsStrip({
  stats,
  isLoading,
}: {
  stats: CustomFieldDefinitionStats | undefined;
  isLoading: boolean;
}) {
  const entitiesCovered = stats?.byEntityType.filter((e) => e.active > 0).length ?? 0;

  const tiles = stats
    ? [
        {
          label: 'Active fields',
          value: stats.active.toLocaleString(),
          icon: <ListChecks aria-hidden />,
          description: `${stats.total.toLocaleString()} defined in this view`,
        },
        {
          label: 'Required',
          value: stats.required.toLocaleString(),
          icon: <Asterisk aria-hidden />,
          description: stats.required > 0 ? 'Must be filled before saving' : 'Nothing is mandatory',
        },
        {
          label: 'Entities extended',
          value: entitiesCovered.toLocaleString(),
          icon: <Boxes aria-hidden />,
          description: 'Record types with at least one active field',
        },
        {
          label: 'Deactivated',
          value: stats.inactive.toLocaleString(),
          icon: <EyeOff aria-hidden />,
          description: stats.inactive > 0 ? 'Hidden on forms, saved values kept' : 'None retired',
        },
      ]
    : [];

  return <StatsStrip tiles={tiles} isLoading={isLoading} />;
}
