'use client';

import { Bar, BarChart as RBarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BORDER_COLOR, FOREGROUND_TEXT, MUTED_TEXT, ordinalColor } from './chart-theme';

export interface BarChartDatum {
  name: string;
  value: number;
  /** Pre-formatted display string (currency/percent/etc.) — this package doesn't know about domain value formats, callers format upstream. */
  formattedValue?: string;
}

/**
 * Horizontal ordinal bar list — one hue, light→dark by rank (this design
 * system has exactly one brand hue plus a reserved gold accent, not a
 * general-purpose categorical palette — see chart-theme.ts). Direct labels
 * (formatted value at the bar's end) stay on by default per the existing
 * dataviz convention; Recharts' Tooltip is a genuine addition on top of
 * that, not a replacement for it.
 */
export function BarChart({ data, height = 280 }: { data: BarChartDatum[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={120} tick={{ fill: MUTED_TEXT, fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted))' }}
          contentStyle={{ background: 'hsl(var(--popover))', border: `1px solid ${BORDER_COLOR}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: FOREGROUND_TEXT, fontWeight: 600, marginBottom: 4 }}
          formatter={(_value, _name, item) => [(item.payload as BarChartDatum).formattedValue ?? (item.payload as BarChartDatum).value, '']}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28} animationDuration={400}>
          {data.map((d, i) => (
            <Cell key={d.name} fill={ordinalColor(i, data.length)} />
          ))}
          <LabelList dataKey="formattedValue" position="right" fill={MUTED_TEXT} fontSize={11} />
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}
