'use client';

import { Cell, Funnel, FunnelChart as RFunnelChart, LabelList, ResponsiveContainer, Tooltip } from 'recharts';
import { BORDER_COLOR, FOREGROUND_TEXT, ordinalColor } from './chart-theme';
import type { BarChartDatum } from './bar-chart';

export interface FunnelDatum extends BarChartDatum {
  /** "% of first stage" — computed by the caller (it already has the full ordered series), not re-derived here. */
  conversionLabel?: string;
}

/** Stage funnel — expects data pre-sorted descending by value (widest stage first); brand ramp light→dark by depth, same "further along reads as darker" convention as the pipeline funnel elsewhere in the app. */
export function FunnelChart({ data, height = 280 }: { data: FunnelDatum[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RFunnelChart margin={{ top: 8, right: 80, left: 80, bottom: 8 }}>
        <Tooltip
          contentStyle={{ background: 'hsl(var(--popover))', border: `1px solid ${BORDER_COLOR}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: FOREGROUND_TEXT, fontWeight: 600 }}
          formatter={(_value, _name, item) => {
            const payload = item.payload as FunnelDatum;
            return [payload.formattedValue ?? payload.value, payload.conversionLabel ?? ''];
          }}
        />
        <Funnel dataKey="value" data={data} isAnimationActive animationDuration={400}>
          {data.map((d, i) => (
            <Cell key={d.name} fill={ordinalColor(i, data.length)} />
          ))}
          <LabelList position="right" dataKey="name" fill={FOREGROUND_TEXT} fontSize={12} />
          <LabelList position="left" dataKey="formattedValue" fill={FOREGROUND_TEXT} fontSize={12} />
        </Funnel>
      </RFunnelChart>
    </ResponsiveContainer>
  );
}
