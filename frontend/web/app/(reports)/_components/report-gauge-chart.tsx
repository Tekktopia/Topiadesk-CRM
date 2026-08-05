'use client';

import { cn } from '@topiadesk/ui';
import type { GaugeShape } from '../_lib/chart';

/**
 * Meter (per the dataviz skill's choosing-a-form.md: "a single ratio
 * against a limit -> Meter, same-ramp track") — a semicircular arc gauge
 * for a `defaultChartType: 'gauge'` report's headline percent measure (see
 * chart.ts's getGaugeShape). Both arcs share one `pathLength={100}` trick:
 * with the path's length normalized to exactly 100 units, `strokeDasharray`
 * can be set directly in percent — `${valuePercent} 100` — without any
 * manual arc-length trigonometry.
 *
 * Severity color assumes higher is better (true for every current
 * `gauge`-typed measure — compliance rate) — documented rather than
 * silently baked in, since a future "lower is better" percent report would
 * need this threshold direction flipped. The unfilled track is a lighter
 * step of the *same* ramp as the fill (not a generic muted gray), per the
 * Meter spec ("blue-on-blue... so state reads across the whole bar").
 */
export function ReportGaugeChart({ shape }: { shape: GaugeShape }) {
  const { measureColumn, valuePercent, sampleSize } = shape;

  const severity: 'good' | 'warning' | 'critical' = valuePercent >= 80 ? 'good' : valuePercent >= 50 ? 'warning' : 'critical';
  const fillClass = severity === 'good' ? 'stroke-success' : severity === 'warning' ? 'stroke-warning' : 'stroke-destructive';
  const trackClass = severity === 'good' ? 'stroke-success/15' : severity === 'warning' ? 'stroke-warning/15' : 'stroke-destructive/15';

  return (
    <div className="flex flex-col items-center gap-1 py-2" aria-label={`${measureColumn.label}: ${valuePercent.toFixed(1)}%`}>
      <div className="relative w-full max-w-xs">
        <svg viewBox="0 0 200 110" className="w-full" role="img" aria-hidden>
          <path
            d="M 14 100 A 86 86 0 0 1 186 100"
            fill="none"
            className={trackClass}
            strokeWidth={16}
            strokeLinecap="round"
            pathLength={100}
          />
          <path
            d="M 14 100 A 86 86 0 0 1 186 100"
            fill="none"
            className={cn(fillClass, 'transition-[stroke-dasharray]')}
            strokeWidth={16}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${valuePercent} 100`}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
          <span className="text-4xl font-semibold leading-none text-foreground">{valuePercent.toFixed(valuePercent % 1 === 0 ? 0 : 1)}%</span>
        </div>
      </div>
      <p className="text-sm font-medium text-foreground">{measureColumn.label}</p>
      <p className="text-xs text-muted-foreground">across {sampleSize.toLocaleString()} row{sampleSize === 1 ? '' : 's'}</p>
    </div>
  );
}
