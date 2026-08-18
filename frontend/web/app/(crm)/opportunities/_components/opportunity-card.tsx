'use client';

import Link from 'next/link';
import { ArrowRight, Loader2, MoreHorizontal } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@topiadesk/ui';
import { formatCurrency, formatDate } from '../../_lib/format';
import type { Opportunity } from '../../_lib/types';
import { ScoreMeter, dealHealthBandLabel } from '../../_components/score-meter';

export interface KanbanStage {
  id: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

export function OpportunityCard({
  opportunity,
  accountName,
  stages,
  onMoveStage,
  isMoving,
  selected,
  onSelectChange,
}: {
  opportunity: Opportunity;
  accountName?: string;
  /** All stages in this opportunity's pipeline, ordered — used to build the "move to" menu and the next-stage shortcut. */
  stages: KanbanStage[];
  onMoveStage: (stageId: string) => void;
  isMoving: boolean;
  /** Bulk-selection state — the checkbox only renders when onSelectChange is provided. */
  selected?: boolean;
  onSelectChange?: (checked: boolean) => void;
}) {
  const currentIndex = stages.findIndex((s) => s.id === opportunity.pipelineStageId);
  const nextStage = currentIndex >= 0 ? stages[currentIndex + 1] : undefined;
  const otherStages = stages.filter((s) => s.id !== opportunity.pipelineStageId);

  // Only meaningful for a deal still in play — a won deal that closed after
  // its expected date is history, not something to chase. Compared
  // date-only, matching expectedCloseDate's @db.Date type, so a deal due
  // today is not flagged.
  const currentStage = stages[currentIndex];
  const isOpen = currentStage ? !currentStage.isWon && !currentStage.isLost : false;
  const isOverdue = isOpen && opportunity.expectedCloseDate.slice(0, 10) < new Date().toISOString().slice(0, 10);

  return (
    <Card className="shadow-brand-sm">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          {onSelectChange ? (
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
              aria-label={`Select ${opportunity.name}`}
              checked={Boolean(selected)}
              onChange={(e) => onSelectChange(e.target.checked)}
            />
          ) : null}
          <Link href={`/opportunities/${opportunity.id}`} className="block text-sm font-medium text-foreground hover:underline">
            {opportunity.name}
          </Link>
        </div>
        <p className="truncate text-xs text-muted-foreground">{accountName ?? 'Unknown account'}</p>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">{formatCurrency(opportunity.amount, opportunity.currency)}</span>
          <Badge variant="outline">{opportunity.probability}%</Badge>
        </div>
        {/* Deal health as a track rather than the numeric Badge this
            replaces — the whole point of the score is comparing cards down a
            column, and a number in a pill looks the same at 12 as at 87.
            Null means the refresh-deal-health job hasn't scored it yet, or
            the deal is already won/lost (the job only scores open ones), so
            the row is omitted entirely rather than shown as a zero. */}
        {opportunity.dealHealthScore !== null ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{dealHealthBandLabel(opportunity.dealHealthScore)}</span>
            <ScoreMeter
              score={opportunity.dealHealthScore}
              ariaLabel={`Deal health ${opportunity.dealHealthScore} of 100 — ${dealHealthBandLabel(opportunity.dealHealthScore)}`}
            />
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Expected close {formatDate(opportunity.expectedCloseDate)}
          {isOverdue ? <span className="ml-1 font-medium text-destructive">· overdue</span> : null}
        </p>

        <div className="flex items-center gap-1 pt-1">
          {nextStage ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 px-2 text-xs"
              disabled={isMoving}
              onClick={() => onMoveStage(nextStage.id)}
            >
              {isMoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
              {nextStage.name}
            </Button>
          ) : (
            <span className="flex-1" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move to stage" disabled={isMoving}>
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {otherStages.map((stage) => (
                <DropdownMenuItem key={stage.id} onSelect={() => onMoveStage(stage.id)}>
                  {stage.name}
                  {stage.isWon ? <Badge variant="success" className="ml-auto">Won</Badge> : null}
                  {stage.isLost ? <Badge variant="destructive" className="ml-auto">Lost</Badge> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
