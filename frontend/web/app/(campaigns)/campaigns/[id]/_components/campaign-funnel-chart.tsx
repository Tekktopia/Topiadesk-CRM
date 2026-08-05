'use client';

import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@topiadesk/ui';
import type { CampaignPerformance } from '../../../_lib/types';

/**
 * Horizontal funnel bar chart — recipients at each stage of the send funnel
 * (Sent -> Delivered -> Opened -> Clicked, each a subset of the last per
 * campaigns.controller.ts's performance() aggregation). Mirrors
 * app/(dashboard)/pipeline-funnel-chart.tsx's exact shape/conventions
 * (direct always-visible labels, per-bar Tooltip, brand ramp light->dark by
 * funnel depth) since that's this codebase's established chart pattern —
 * no Recharts dependency is used anywhere in this codebase.
 */
export function CampaignFunnelChart({ performance }: { performance: CampaignPerformance }) {
  if (performance.totalRecipients === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No recipients yet.</div>;
  }

  const steps = [
    { label: 'Sent', count: performance.sent },
    { label: 'Delivered', count: performance.delivered },
    { label: 'Opened', count: performance.opened },
    { label: 'Clicked', count: performance.clicked },
  ];
  const maxCount = Math.max(1, performance.sent);
  const rampClasses = ['bg-brand-700', 'bg-brand-600', 'bg-brand-500', 'bg-brand-400'];

  return (
    <ul className="space-y-2.5" aria-label="Campaign send funnel">
      {steps.map((step, i) => {
        const widthPercent = Math.max(2, Math.round((step.count / maxCount) * 100));
        return (
          <li key={step.label} className="grid grid-cols-[minmax(0,90px)_1fr_auto] items-center gap-3">
            <span className="truncate text-sm font-medium text-foreground">{step.label}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  className="h-6 w-full overflow-hidden rounded-sm bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                  role="img"
                  aria-label={`${step.label}: ${step.count.toLocaleString()}`}
                >
                  <div className={cn('h-full rounded-r-[4px] transition-[width]', rampClasses[i] ?? 'bg-brand-500')} style={{ width: `${widthPercent}%` }} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                {step.count.toLocaleString()} {step.label.toLowerCase()}
              </TooltipContent>
            </Tooltip>
            <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">{step.count.toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}
