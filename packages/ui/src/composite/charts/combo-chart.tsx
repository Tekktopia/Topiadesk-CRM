'use client';

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BORDER_COLOR, FOREGROUND_TEXT, MUTED_TEXT } from './chart-theme';

export interface ComboDatum {
  name: string;
  bar: number;
  line: number;
}

/** New visual type (no hand-rolled precedent) — two measures against one dimension, one as bars (brand) one as a line (gold) on a shared axis; for e.g. "premium written vs. loss ratio by month." */
export function ComboChart({ data, barLabel, lineLabel, height = 280 }: { data: ComboDatum[]; barLabel: string; lineLabel: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={BORDER_COLOR} />
        <XAxis dataKey="name" tick={{ fill: MUTED_TEXT, fontSize: 11 }} tickLine={false} axisLine={{ stroke: BORDER_COLOR }} />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: 'hsl(var(--popover))', border: `1px solid ${BORDER_COLOR}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: FOREGROUND_TEXT, fontWeight: 600, marginBottom: 4 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: MUTED_TEXT }} />
        <Bar dataKey="bar" name={barLabel} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={32} animationDuration={400} />
        <Line dataKey="line" name={lineLabel} stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 3 }} animationDuration={400} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
