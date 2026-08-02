'use client';

import { Tooltip, TooltipContent, TooltipTrigger, Badge, cn } from '@topiadesk/ui';
import { formatNaira } from '@/app/(policy)/lib/format';
import type { FunnelStage } from './types';

/**
 * Horizontal funnel bar chart — opportunity count per pipeline stage, in
 * stage order. Built per the dataviz skill (loaded before writing this):
 * a single series (count) needs no legend, so this uses direct labels
 * (stage name + count + value, always visible — nothing is gated behind
 * hover) plus a per-bar Tooltip for the extra detail. Bars are capped at
 * 24px, square at the baseline (left) and 4px-rounded at the data end
 * (right, per marks-and-anatomy.md's bar spec). Color is ordinal, not
 * arbitrary: open stages step through the brand ramp light->dark by stage
 * order (progression reads as "further along"); the won/lost terminal
 * stages use the reserved status colors (success/destructive) instead of
 * continuing the ramp, since those are state, not sequence.
 */
export function PipelineFunnelChart({ stages, pipelineName }: { stages: FunnelStage[]; pipelineName: string | null }) {
  if (stages.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No pipeline configured yet.
      </div>
    );
  }

  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const openRampClasses = ['bg-brand-300', 'bg-brand-400', 'bg-brand-500', 'bg-brand-600', 'bg-brand-700', 'bg-brand-800'];
  let openIndex = 0;

  return (
    <div className="space-y-3">
      {pipelineName ? <p className="text-xs text-muted-foreground">Pipeline: {pipelineName}</p> : null}
      <ul className="space-y-2.5" aria-label="Opportunity pipeline by stage">
        {stages.map((stage) => {
          const widthPercent = Math.max(2, Math.round((stage.count / maxCount) * 100));
          let colorClass: string;
          if (stage.isWon) colorClass = 'bg-success';
          else if (stage.isLost) colorClass = 'bg-destructive/60';
          else {
            colorClass = openRampClasses[Math.min(openIndex, openRampClasses.length - 1)] ?? 'bg-brand-500';
            openIndex += 1;
          }

          return (
            <li key={stage.stageId} className="grid grid-cols-[minmax(0,120px)_1fr_auto] items-center gap-3">
              <span className="truncate text-sm font-medium text-foreground" title={stage.name}>
                {stage.name}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    className="h-6 w-full overflow-hidden rounded-sm bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                    role="img"
                    aria-label={`${stage.name}: ${stage.count} opportunities, ${formatNaira(stage.value)}`}
                  >
                    <div
                      className={cn('h-full rounded-r-[4px] transition-[width]', colorClass)}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="space-y-0.5">
                    <p className="font-medium text-popover-foreground">{stage.name}</p>
                    <p>
                      <span className="font-semibold">{stage.count}</span> opportunities
                    </p>
                    <p>{formatNaira(stage.value)} total value</p>
                    {stage.isWon ? <Badge variant="success">Won</Badge> : null}
                    {stage.isLost ? <Badge variant="destructive">Lost</Badge> : null}
                  </div>
                </TooltipContent>
              </Tooltip>
              <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                {stage.count} · {formatNaira(stage.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
