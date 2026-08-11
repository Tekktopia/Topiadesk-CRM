'use client';

import { ResponsiveContainer, Tooltip, Treemap as RTreemap } from 'recharts';
import { BORDER_COLOR, FOREGROUND_TEXT, ordinalColor } from './chart-theme';
import type { BarChartDatum } from './bar-chart';

/** Recharts' Treemap requires an index signature on its data type — BarChartDatum's named fields already satisfy it structurally, this just makes the shape explicit for the type checker. */
type TreemapDatum = BarChartDatum & { [key: string]: unknown };

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  index?: number;
  root?: { children?: unknown[] };
}

function TreemapCell({ x = 0, y = 0, width = 0, height = 0, name, index = 0, root }: TreemapContentProps) {
  const total = root?.children?.length ?? 1;
  const fill = ordinalColor(index, total);
  const showLabel = width > 44 && height > 24;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="hsl(var(--card))" strokeWidth={2} rx={4} />
      {showLabel ? (
        <text x={x + 8} y={y + 18} fontSize={12} fill="hsl(var(--card))" fontWeight={500}>
          {name}
        </text>
      ) : null}
    </g>
  );
}

/** Composition by magnitude — Recharts' native squarified treemap (same algorithm family as the retired hand-rolled `computeTreemapLayout`), one ordinal ramp step per tile by rank. */
export function TreemapChart({ data, height = 280 }: { data: BarChartDatum[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RTreemap data={data as TreemapDatum[]} dataKey="value" nameKey="name" aspectRatio={2} animationDuration={400} content={<TreemapCell />}>
        <Tooltip
          contentStyle={{ background: 'hsl(var(--popover))', border: `1px solid ${BORDER_COLOR}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: FOREGROUND_TEXT, fontWeight: 600 }}
          formatter={(_value, _name, item) => {
            const payload = item.payload as BarChartDatum;
            return [payload.formattedValue ?? payload.value, payload.name];
          }}
        />
      </RTreemap>
    </ResponsiveContainer>
  );
}
