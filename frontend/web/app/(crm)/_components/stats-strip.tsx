'use client';

import * as React from 'react';
import { GradientStatTile, Skeleton } from '@topiadesk/ui';

/**
 * The KPI strip every CRM list page puts above its table.
 *
 * Extracted after the leads and pipeline strips turned out to be the same
 * component with different data, and three more modules were about to copy
 * it a third, fourth and fifth time. Callers supply tiles; this owns the
 * grid, the loading skeletons and the accent rotation.
 *
 * Accents cycle through the curated violet/navy/blue/teal set
 * (chart-theme.ts's CATEGORICAL_GRADIENTS) in order, so every page's strip
 * reads as the same component rather than each picking its own colours.
 */
const ACCENTS = ['violet', 'navy', 'blue', 'teal'] as const;

export interface StatTileSpec {
  label: string;
  value: string | number;
  /** Pre-rendered JSX, not a component reference — GradientStatTile's Server->Client serialization contract. */
  icon?: React.ReactNode;
  description?: string;
}

export function StatsStrip({ tiles, isLoading }: { tiles: StatTileSpec[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: Math.max(tiles.length, 4) }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (tiles.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile, i) => (
        <GradientStatTile
          key={tile.label}
          accent={ACCENTS[i % ACCENTS.length]}
          label={tile.label}
          value={tile.value}
          icon={tile.icon}
          description={tile.description}
        />
      ))}
    </div>
  );
}
