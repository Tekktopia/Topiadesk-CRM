'use client';

import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { BarChartDatum } from './bar-chart';

/**
 * New visual type (no hand-rolled precedent) — a headline number + trend
 * sparkline + period-over-period delta, the "single most important number
 * on a BI dashboard" card format. `trend` is the full series (oldest→
 * newest); the last two points drive the delta arrow/percent, matching how
 * a Power BI KPI visual reads "vs. previous period."
 */
export function KpiChart({ label, formattedValue, trend }: { label: string; formattedValue: string; trend?: BarChartDatum[] }) {
  const last = trend?.[trend.length - 1]?.value;
  const prev = trend && trend.length > 1 ? trend[trend.length - 2]?.value : undefined;
  const deltaPercent = last !== undefined && prev !== undefined && prev !== 0 ? ((last - prev) / Math.abs(prev)) * 100 : null;

  return (
    <div className="flex h-full flex-col justify-between gap-2 py-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{formattedValue}</span>
          {deltaPercent !== null ? (
            <span className={cn('flex items-center gap-0.5 text-xs font-medium', deltaPercent >= 0 ? 'text-success' : 'text-destructive')}>
              {deltaPercent >= 0 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
              {Math.abs(deltaPercent).toFixed(1)}%
            </span>
          ) : null}
        </div>
      </div>
      {trend && trend.length > 1 ? (
        <ResponsiveContainer width="100%" height={48}>
          <AreaChart data={trend} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="kpiSparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#kpiSparkFill)" isAnimationActive animationDuration={400} />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
