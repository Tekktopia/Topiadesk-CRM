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
}: {
  opportunity: Opportunity;
  accountName?: string;
  /** All stages in this opportunity's pipeline, ordered — used to build the "move to" menu and the next-stage shortcut. */
  stages: KanbanStage[];
  onMoveStage: (stageId: string) => void;
  isMoving: boolean;
}) {
  const currentIndex = stages.findIndex((s) => s.id === opportunity.pipelineStageId);
  const nextStage = currentIndex >= 0 ? stages[currentIndex + 1] : undefined;
  const otherStages = stages.filter((s) => s.id !== opportunity.pipelineStageId);

  return (
    <Card className="shadow-brand-sm">
      <CardContent className="space-y-2 p-3">
        <Link href={`/opportunities/${opportunity.id}`} className="block text-sm font-medium text-foreground hover:underline">
          {opportunity.name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{accountName ?? 'Unknown account'}</p>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">{formatCurrency(opportunity.amount)}</span>
          <Badge variant="outline">{opportunity.probability}%</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Expected close {formatDate(opportunity.expectedCloseDate)}</p>

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
