'use client';

import * as React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../primitives/card';

/**
 * `packages/ui/src/composite/` — components built from >1 primitive that
 * encode a TopiaDesk-specific UX pattern (as opposed to `primitives/`,
 * which are generic Radix wrappers with no product opinion). Batch 2
 * frontend agents add `DocumentPanel`, `ActivityTimeline`, `TaskList` etc.
 * here — this file is the working example to copy the shape of, not a
 * component to extend in place.
 */
export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  /**
   * Pre-rendered JSX (e.g. `icon={<Briefcase className="h-4 w-4" />}`), NOT
   * a component reference (`icon={Briefcase}`). A raw component type is a
   * function and functions cannot cross the Server->Client Component
   * serialization boundary — passing one from a Server Component parent
   * (no 'use client') into this Client Component throws at build/render
   * time. JSX elements are plain serializable objects, so this direction
   * works from either a Server or Client Component caller.
   */
  icon?: React.ReactNode;
  /** Signed percentage or absolute delta vs. the prior period, e.g. `+12%` or `-3`. */
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'flat';
    /** Whether an "up" trend is good news for this metric (default true —
     * set false for metrics like "overdue renewals" where up is bad). */
    positiveDirection?: 'up' | 'down';
  };
  description?: string;
}

const StatTile = React.forwardRef<HTMLDivElement, StatTileProps>(
  ({ className, label, value, icon, trend, description, ...props }, ref) => {
    const isGood =
      trend &&
      trend.direction !== 'flat' &&
      trend.direction === (trend.positiveDirection ?? 'up');

    return (
      <Card ref={ref} className={cn('overflow-hidden', className)} {...props}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          {icon ? <span className="h-4 w-4 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span> : null}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
          {trend ? (
            <p
              className={cn(
                'mt-1 flex items-center gap-1 text-xs font-medium',
                trend.direction === 'flat' && 'text-muted-foreground',
                trend.direction !== 'flat' && (isGood ? 'text-success' : 'text-destructive'),
              )}
            >
              {trend.direction === 'up' && <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />}
              {trend.direction === 'down' && <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
              <span>{trend.value}</span>
              {description ? <span className="font-normal text-muted-foreground">{description}</span> : null}
            </p>
          ) : description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </CardContent>
      </Card>
    );
  },
);
StatTile.displayName = 'StatTile';

export { StatTile };
