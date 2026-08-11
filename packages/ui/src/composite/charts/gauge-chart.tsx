'use client';

import { RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';
import { severityColor, severityFromPercent } from './chart-theme';

/**
 * Semicircular "Meter" — a single ratio against a limit. Re-implemented on
 * Recharts (RadialBarChart, 180°→0° sweep) but preserving the exact visual
 * language of the original hand-rolled version verbatim: same-hue
 * track+fill (the unfilled track is a lighter step of the *same* hue as
 * the fill, never a generic gray — "blue-on-blue... so state reads across
 * the whole bar"), and the documented "higher is better" severity
 * threshold assumption (a future lower-is-better percent measure would
 * need this flipped — same caveat as before, just carried forward).
 */
export function GaugeChart({ label, valuePercent, sampleSize, height = 200 }: { label: string; valuePercent: number; sampleSize?: number; height?: number }) {
  const clamped = Math.min(100, Math.max(0, valuePercent));
  const severity = severityFromPercent(clamped);
  const { fill, track } = severityColor(severity);
  const data = [{ name: label, value: clamped, fill }];

  return (
    <div className="flex flex-col items-center gap-1 py-2" aria-label={`${label}: ${clamped.toFixed(1)}%`}>
      <div className="relative w-full max-w-xs">
        <ResponsiveContainer width="100%" height={height}>
          <RadialBarChart
            data={data}
            startAngle={180}
            endAngle={0}
            innerRadius="70%"
            outerRadius="100%"
            barSize={16}
            cy="85%"
          >
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: track }} isAnimationActive animationDuration={400} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
          <span className="text-4xl font-semibold leading-none text-foreground">{clamped.toFixed(clamped % 1 === 0 ? 0 : 1)}%</span>
        </div>
      </div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      {sampleSize !== undefined ? (
        <p className="text-xs text-muted-foreground">
          across {sampleSize.toLocaleString()} row{sampleSize === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}
