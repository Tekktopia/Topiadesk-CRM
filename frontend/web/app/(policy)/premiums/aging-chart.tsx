'use client';

import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@topiadesk/ui';
import { AGING_BUCKET_ORDER, agingBucketLabel, formatNaira } from '@/app/(policy)/lib/format';

export interface AgingBucketSummary {
  bucket: string;
  count: number;
  outstanding: number;
}

/** Severity ramp for the 5 aging buckets — reserved status color (warning
 * -> destructive), stepped by opacity to read as escalating risk, per the
 * dataviz skill's rule that status colors encode state (here: collections
 * risk), not an arbitrary categorical series. CURRENT uses success since
 * "not yet due" is the good state. */
const BUCKET_COLOR: Record<string, string> = {
  CURRENT: 'bg-success',
  '1_30': 'bg-warning/45',
  '31_60': 'bg-warning/70',
  '61_90': 'bg-warning',
  '90_PLUS': 'bg-destructive',
};

/**
 * Premium aging — a vertical bar-per-bucket chart, bars capped at the
 * skill's 24px column-thickness spec, direct-labeled (bucket name + count
 * below, outstanding value above) since there's only one series (no
 * legend needed). Built per the dataviz skill, loaded before writing this.
 */
export function AgingChart({ buckets }: { buckets: AgingBucketSummary[] }) {
  const byBucket = new Map(buckets.map((b) => [b.bucket, b]));
  const maxOutstanding = Math.max(1, ...buckets.map((b) => b.outstanding));

  return (
    <div className="flex items-end gap-6 pt-8" style={{ height: 220 }}>
      {AGING_BUCKET_ORDER.map((bucket) => {
        const summary = byBucket.get(bucket) ?? { bucket, count: 0, outstanding: 0 };
        const heightPercent = Math.max(2, Math.round((summary.outstanding / maxOutstanding) * 100));
        return (
          <div key={bucket} className="flex flex-1 flex-col items-center justify-end gap-2" style={{ height: '100%' }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-full w-full flex-col items-center justify-end">
                  <span className="mb-1 text-xs font-medium tabular-nums text-foreground">
                    {summary.outstanding > 0 ? formatNaira(summary.outstanding) : ''}
                  </span>
                  <div
                    tabIndex={0}
                    role="img"
                    aria-label={`${agingBucketLabel(bucket)}: ${summary.count} premiums, ${formatNaira(summary.outstanding)} outstanding`}
                    className={cn(
                      'w-6 rounded-t-[4px] transition-[height] focus:outline-none focus:ring-2 focus:ring-ring',
                      BUCKET_COLOR[bucket] ?? 'bg-muted',
                    )}
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="font-medium text-popover-foreground">{agingBucketLabel(bucket)}</p>
                <p>
                  <span className="font-semibold">{summary.count}</span> premium{summary.count === 1 ? '' : 's'}
                </p>
                <p>{formatNaira(summary.outstanding)} outstanding</p>
              </TooltipContent>
            </Tooltip>
            <div className="text-center">
              <p className="text-xs font-medium text-foreground">{agingBucketLabel(bucket)}</p>
              <p className="text-[11px] text-muted-foreground">{summary.count}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
