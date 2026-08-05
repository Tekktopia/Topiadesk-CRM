'use client';

import { cn, Tooltip, TooltipContent, TooltipTrigger } from '@topiadesk/ui';

/**
 * Score distribution — count of responded SurveyResponse rows per score
 * value, scaleMin..scaleMax. Single series (count), so per the dataviz
 * skill this needs no legend — the card title names it. Score is an
 * ordinal, low-to-high scale, the same "progression" shape
 * app/(dashboard)/pipeline-funnel-chart.tsx's stage bars already encode
 * with the brand ramp light->dark by position; this reuses that exact
 * convention (same Tailwind steps, already-validated in this codebase)
 * rather than introducing a second color rule for one more single-series
 * bar chart. Direct labels (score + count) are always visible; a Tooltip
 * adds the percentage-of-total detail on demand, not gating anything
 * essential behind hover.
 */
export function ScoreDistributionChart({ scaleMin, scaleMax, scores }: { scaleMin: number; scaleMax: number; scores: number[] }) {
  // Survey.scaleMax has no backend-enforced upper bound (@IsInt @Min(1)
  // only) — realistic CSAT/NPS/CES scales are all <=10, but guard against
  // one exact-value row per integer blowing up the list for an
  // unusually wide scale by falling back to one row per whole point only
  // when the range is small enough to read as discrete bars.
  const range = scaleMax - scaleMin;
  const step = range <= 20 ? 1 : Math.ceil((range + 1) / 10);
  const buckets: { start: number; end: number }[] = [];
  for (let s = scaleMin; s <= scaleMax; s += step) buckets.push({ start: s, end: Math.min(s + step - 1, scaleMax) });

  function bucketIndexFor(score: number): number {
    return Math.min(buckets.length - 1, Math.max(0, Math.floor((score - scaleMin) / step)));
  }
  const counts = new Array<number>(buckets.length).fill(0);
  for (const score of scores) {
    const index = bucketIndexFor(score);
    counts[index] = (counts[index] ?? 0) + 1;
  }
  const total = scores.length;
  const maxCount = Math.max(1, ...counts);

  const rampClasses = ['bg-brand-200', 'bg-brand-300', 'bg-brand-400', 'bg-brand-500', 'bg-brand-600', 'bg-brand-700', 'bg-brand-800', 'bg-brand-900'];

  if (total === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No responses yet.</p>;
  }

  return (
    <ul className="space-y-2.5" aria-label="Score distribution">
      {buckets.map((bucket, index) => {
        const count = counts[index] ?? 0;
        const widthPercent = count === 0 ? 0 : Math.max(2, Math.round((count / maxCount) * 100));
        const rampIndex = buckets.length <= 1 ? 0 : Math.round((index / (buckets.length - 1)) * (rampClasses.length - 1));
        const colorClass = rampClasses[rampIndex] ?? 'bg-brand-500';
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const label = bucket.start === bucket.end ? String(bucket.start) : `${bucket.start}–${bucket.end}`;

        return (
          <li key={bucket.start} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3">
            <span className="text-right text-sm font-medium tabular-nums text-foreground">{label}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  className="h-6 w-full overflow-hidden rounded-sm bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                  role="img"
                  aria-label={`Score ${label}: ${count} responses, ${pct}%`}
                >
                  <div className={cn('h-full rounded-r-[4px] transition-[width]', colorClass)} style={{ width: `${widthPercent}%` }} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>
                  Score {label}: <span className="font-semibold">{count}</span> response{count === 1 ? '' : 's'} ({pct}%)
                </p>
              </TooltipContent>
            </Tooltip>
            <span className="w-16 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}
