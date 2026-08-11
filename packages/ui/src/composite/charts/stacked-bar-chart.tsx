'use client';

import { Bar, BarChart as RBarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BORDER_COLOR, FOREGROUND_TEXT, MUTED_TEXT, seriesColor } from './chart-theme';

/** One row per category, one numeric key per series (already pivoted by the caller — capping/aggregation/"Other"-folding is a domain concern, stays in the Reports module's adapter layer). */
export type StackedBarDatum = { category: string } & Record<string, string | number>;

/** Stacked bar — always shows a legend (2+ series never rely on color alone, per the existing dataviz convention); brand/gold ramps alternate for series identity. */
export function StackedBarChart({ data, seriesKeys, height = 280 }: { data: StackedBarDatum[]; seriesKeys: string[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={BORDER_COLOR} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="category" width={120} tick={{ fill: MUTED_TEXT, fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted))' }}
          contentStyle={{ background: 'hsl(var(--popover))', border: `1px solid ${BORDER_COLOR}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: FOREGROUND_TEXT, fontWeight: 600, marginBottom: 4 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: MUTED_TEXT }} />
        {seriesKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="stack"
            fill={seriesColor(i)}
            radius={i === seriesKeys.length - 1 ? [0, 4, 4, 0] : undefined}
            maxBarSize={28}
            animationDuration={400}
          />
        ))}
      </RBarChart>
    </ResponsiveContainer>
  );
}
