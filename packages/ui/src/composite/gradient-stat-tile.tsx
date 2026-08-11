'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../primitives/card';

const gradientStatTileVariants = cva('overflow-hidden text-white', {
  variants: {
    accent: {
      violet: 'bg-gradient-to-br from-violet-500 to-violet-700',
      navy: 'bg-gradient-to-br from-navy-500 to-navy-700',
      blue: 'bg-gradient-to-br from-brand-500 to-brand-700',
      teal: 'bg-gradient-to-br from-teal-600 to-teal-800',
    },
  },
  defaultVariants: { accent: 'blue' },
});

export interface GradientStatTileProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof gradientStatTileVariants> {
  label: string;
  value: string | number;
  /** Pre-rendered JSX, not a component reference — same Server->Client serialization contract as StatTile (see stat-tile.tsx's doc comment). */
  icon?: React.ReactNode;
  description?: string;
}

/**
 * Solid-gradient KPI tile — the colorful counterpart to StatTile's plain
 * white card, cycling through the curated violet/navy/blue/teal accent set
 * (chart-theme.ts's CATEGORICAL_GRADIENTS) for the dashboard's top-of-page
 * KPI strip specifically. StatTile itself is unchanged and stays in use
 * everywhere else (e.g. case-dashboard-view.tsx) — this is a new, separate
 * composite, not a variant bolted onto StatTile, since every other current
 * StatTile caller wants the plain white treatment.
 */
const GradientStatTile = React.forwardRef<HTMLDivElement, GradientStatTileProps>(
  ({ className, accent, label, value, icon, description, ...props }, ref) => {
    return (
      <Card ref={ref} className={cn(gradientStatTileVariants({ accent }), className)} {...props}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-white/80">{label}</CardTitle>
          {icon ? <span className="h-4 w-4 text-white/70 [&>svg]:h-4 [&>svg]:w-4">{icon}</span> : null}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
          {description ? <p className="mt-1 text-xs text-white/75">{description}</p> : null}
        </CardContent>
      </Card>
    );
  },
);
GradientStatTile.displayName = 'GradientStatTile';

export { GradientStatTile, gradientStatTileVariants };
