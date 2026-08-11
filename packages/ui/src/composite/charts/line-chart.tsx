'use client';

import type { ComponentProps } from 'react';
import { CartesianGrid, Legend, Line, LineChart as RLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BORDER_COLOR, FOREGROUND_TEXT, MUTED_TEXT } from './chart-theme';
import type { BarChartDatum } from './bar-chart';

export interface LineSeriesSpec {
  dataKey: string;
  label: string;
  color: string;
}

/**
 * Trend line. Single-series (default, `series` omitted): unchanged from
 * before — no legend (the card title names it), dataKey="value", direct
 * hover tooltip reading `formattedValue`/`value` off each datum. Multi-
 * series (`series` provided): one `<Line>` per entry, always shows a
 * Legend (2+ series never rely on color alone — same convention
 * StackedBarChart applies), and by default the tooltip shows each series'
 * plotted value via Recharts' own multi-line default rendering. Pass
 * `formatter` to override that — e.g. when the plotted values are
 * index-normalized for a shared axis but the tooltip should show the raw
 * stored numbers instead (see dashboard-view.tsx's "Won deals" chart).
 */
export function LineChart({
  data,
  valueLabel,
  height = 260,
  series,
  formatter,
}: {
  data: BarChartDatum[];
  valueLabel?: string;
  height?: number;
  series?: LineSeriesSpec[];
  formatter?: ComponentProps<typeof Tooltip>['formatter'];
}) {
  const defaultSingleFormatter: ComponentProps<typeof Tooltip>['formatter'] = (_value, _name, item) => [
    (item.payload as BarChartDatum).formattedValue ?? (item.payload as BarChartDatum).value,
    valueLabel ?? '',
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={BORDER_COLOR} />
        <XAxis dataKey="name" tick={{ fill: MUTED_TEXT, fontSize: 11 }} tickLine={false} axisLine={{ stroke: BORDER_COLOR }} />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: 'hsl(var(--popover))', border: `1px solid ${BORDER_COLOR}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: FOREGROUND_TEXT, fontWeight: 600, marginBottom: 4 }}
          formatter={formatter ?? (series ? undefined : defaultSingleFormatter)}
        />
        {series ? <Legend wrapperStyle={{ fontSize: 12, color: MUTED_TEXT }} /> : null}
        {series ? (
          series.map((s) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: s.color, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
              activeDot={{ r: 5 }}
              animationDuration={400}
            />
          ))
        ) : (
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 2, stroke: 'hsl(var(--card))' }}
            activeDot={{ r: 5 }}
            animationDuration={400}
          />
        )}
      </RLineChart>
    </ResponsiveContainer>
  );
}
