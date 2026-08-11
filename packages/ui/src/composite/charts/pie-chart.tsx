'use client';

import { Cell, Pie, PieChart as RPieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { BORDER_COLOR, FOREGROUND_TEXT, MUTED_TEXT, categoricalColor } from './chart-theme';
import type { BarChartDatum } from './bar-chart';

const RADIAN = Math.PI / 180;

/** Recharts' custom label render props for a Pie — only the fields this renderer actually reads, all optional to match Recharts' own (surprisingly all-optional) PieLabelRenderProps type. */
interface PieLabelRenderProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  name?: string | number;
  percent?: number;
  fill?: string;
}

/**
 * Leader-line label — a thin line from the slice edge out to a two-part
 * text label (bold percent, then muted category name), rather than
 * Recharts' built-in `label`/`labelLine` (a bare black polyline with no
 * control over line color or text hierarchy). Always used regardless of
 * slice count; callers are responsible for capping to a readable number of
 * slices (top-N + "Other") before passing data in, same cap-and-fold
 * pattern report-chart.tsx's toStackedDatums already uses for stacked bars.
 */
function renderLeaderLabel({ cx = 0, cy = 0, midAngle = 0, outerRadius = 0, name = '', percent = 0, fill = FOREGROUND_TEXT }: PieLabelRenderProps) {
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const startX = cx + outerRadius * cos;
  const startY = cy + outerRadius * sin;
  const bendX = cx + (outerRadius + 12) * cos;
  const bendY = cy + (outerRadius + 12) * sin;
  const endX = cx + (outerRadius + 24) * cos;
  const textAnchor = cos >= 0 ? 'start' : 'end';
  return (
    <g>
      <path d={`M${startX},${startY}L${bendX},${bendY}L${endX},${bendY}`} stroke={BORDER_COLOR} fill="none" />
      <circle cx={endX} cy={bendY} r={2} fill={fill} stroke="none" />
      <text x={endX + (cos >= 0 ? 6 : -6)} y={bendY} textAnchor={textAnchor} dominantBaseline="central" fontSize={12}>
        <tspan fill={FOREGROUND_TEXT} fontWeight={600}>{`${(percent * 100).toFixed(1)}%`}</tspan>
        <tspan fill={MUTED_TEXT} dx={4}>{name}</tspan>
      </text>
    </g>
  );
}

/**
 * Composition/share-of-whole. `donut` toggles an inner radius (same data,
 * same component, per Power BI's own treatment of pie/donut as a style
 * variant rather than a different chart). Every slice gets a leader-line
 * label (renderLeaderLabel above) — no legend fallback, since a direct
 * label is always more readable than a separate color key; slice identity
 * comes from the curated categorical ramp (chart-theme.ts's
 * categoricalColor), cycling if the caller passes more than 4 slices
 * (callers should cap to top-N + "Other" well before that point).
 */
export function PieChart({ data, donut = false, height = 280 }: { data: BarChartDatum[]; donut?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RPieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={donut ? '55%' : 0}
          outerRadius="65%"
          paddingAngle={data.length > 1 ? 2 : 0}
          animationDuration={400}
          label={renderLeaderLabel}
          labelLine={false}
        >
          {data.map((d, i) => (
            <Cell key={d.name} fill={categoricalColor(i)} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: 'hsl(var(--popover))', border: `1px solid ${BORDER_COLOR}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: FOREGROUND_TEXT, fontWeight: 600 }}
          formatter={(_value, _name, item) => [(item.payload as BarChartDatum).formattedValue ?? (item.payload as BarChartDatum).value, (item.payload as BarChartDatum).name]}
        />
      </RPieChart>
    </ResponsiveContainer>
  );
}
