'use client';

import { Area, AreaChart as RAreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BORDER_COLOR, FOREGROUND_TEXT, MUTED_TEXT } from './chart-theme';
import type { BarChartDatum } from './bar-chart';

/** Filled trend — same shape/conventions as LineChart, for when magnitude-under-the-curve reads better than a bare line (cumulative totals, volume over time). */
export function AreaChart({ data, valueLabel, height = 260 }: { data: BarChartDatum[]; valueLabel?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RAreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={BORDER_COLOR} />
        <XAxis dataKey="name" tick={{ fill: MUTED_TEXT, fontSize: 11 }} tickLine={false} axisLine={{ stroke: BORDER_COLOR }} />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: 'hsl(var(--popover))', border: `1px solid ${BORDER_COLOR}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: FOREGROUND_TEXT, fontWeight: 600, marginBottom: 4 }}
          formatter={(_value, _name, item) => [(item.payload as BarChartDatum).formattedValue ?? (item.payload as BarChartDatum).value, valueLabel ?? '']}
        />
        <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#areaFill)" animationDuration={400} />
      </RAreaChart>
    </ResponsiveContainer>
  );
}
