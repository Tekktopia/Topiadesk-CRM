'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRightLeft, Building2, ChevronRight, Loader2, Mail, Phone } from 'lucide-react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  cn,
} from '@topiadesk/ui';
import { LEAD_STATUSES, leadStatusLabel } from '../../_lib/constants';
import { fullName } from '../../_lib/format';
import type { Lead } from '../../_lib/types';
import { ScoreMeter, leadScoreBandLabel, scoreBand } from '../../_components/score-meter';

/**
 * Pipeline board for leads, columned by LeadStatus.
 *
 * Status changes are made through an explicit per-card menu rather than
 * HTML5 drag-and-drop — the same interaction opportunities-kanban-view.tsx
 * already settled on. Drag is worse here on two counts: it is unusable by
 * keyboard and screen-reader users without a large custom a11y layer, and
 * these columns scroll horizontally on narrow viewports, where dragging
 * across a scroll boundary is famously fiddly. A menu is boring and works.
 *
 * CONVERTED is rendered as a column but never offered as a move target:
 * conversion creates an Account (and optionally an Opportunity) through the
 * dedicated convert dialog, so flipping the status alone would produce a
 * lead marked converted with nothing to show for it.
 */
const TERMINAL_STATUSES = new Set(['CONVERTED']);

// One accent per column, tracking the pipeline's natural progression from
// "untouched" through to "won". Only the top rule is colored; the column
// body stays neutral so the cards inside keep their own contrast.
const COLUMN_ACCENT: Record<string, string> = {
  NEW: 'bg-slate-400',
  CONTACTED: 'bg-blue-500',
  QUALIFIED: 'bg-violet-500',
  CONVERTED: 'bg-emerald-500',
  DISQUALIFIED: 'bg-rose-400',
};

export function LeadsBoardView({
  leads,
  isLoading,
  onMoveStatus,
  onConvert,
  movingId,
}: {
  leads: Lead[];
  isLoading: boolean;
  onMoveStatus: (lead: Lead, status: string) => void;
  onConvert: (lead: Lead) => void;
  movingId: string | null;
}) {
  const byStatus = React.useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const status of LEAD_STATUSES) map.set(status, []);
    for (const lead of leads) {
      // A status outside the known enum (older row, future value) would
      // otherwise vanish silently — bucket it so nothing is lost from view.
      if (!map.has(lead.status)) map.set(lead.status, []);
      map.get(lead.status)!.push(lead);
    }
    return map;
  }, [leads]);

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {[...byStatus.entries()].map(([status, items]) => {
        const averageScore =
          items.length === 0 ? 0 : Math.round(items.reduce((sum, l) => sum + l.score, 0) / items.length);
        return (
          <section
            key={status}
            aria-label={`${leadStatusLabel(status)} — ${items.length} leads`}
            className="flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/30"
          >
            <div className={cn('h-1 w-full', COLUMN_ACCENT[status] ?? 'bg-slate-400')} />
            <div className="border-b border-border p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{leadStatusLabel(status)}</h3>
                <Badge variant="outline" className="tabular-nums">
                  {items.length}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {items.length === 0 ? 'Empty' : `Avg score ${averageScore}`}
              </p>
            </div>
            <div className="flex-1 space-y-2 p-2">
              {items.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">No leads here.</p>
              ) : (
                items.map((lead) => (
                  <LeadBoardCard
                    key={lead.id}
                    lead={lead}
                    isMoving={movingId === lead.id}
                    onMoveStatus={(next) => onMoveStatus(lead, next)}
                    onConvert={() => onConvert(lead)}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LeadBoardCard({
  lead,
  isMoving,
  onMoveStatus,
  onConvert,
}: {
  lead: Lead;
  isMoving: boolean;
  onMoveStatus: (status: string) => void;
  onConvert: () => void;
}) {
  const name = fullName(lead.firstName, lead.lastName);
  const band = scoreBand(lead.score);
  const moveTargets = LEAD_STATUSES.filter((s) => s !== lead.status && !TERMINAL_STATUSES.has(s));

  return (
    <article
      className={cn(
        'rounded-md border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md',
        // A hot lead should be findable by scanning the board, not by
        // reading every card's number.
        band === 'high' && 'border-l-2 border-l-emerald-500',
        isMoving && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-foreground hover:underline">
          {name}
        </Link>
        {isMoving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden /> : null}
      </div>

      {lead.companyName ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{lead.companyName}</span>
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {lead.email ? (
          <span className="flex min-w-0 items-center gap-1">
            <Mail className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{lead.email}</span>
          </span>
        ) : null}
        {lead.phone ? (
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3 shrink-0" aria-hidden />
            {lead.phone}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <ScoreMeter score={lead.score} ariaLabel={`Score ${lead.score} of 100 — ${leadScoreBandLabel(lead.score)}`} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={isMoving}>
              Move <ChevronRight className="h-3 w-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {moveTargets.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onMoveStatus(s)}>
                {leadStatusLabel(s)}
              </DropdownMenuItem>
            ))}
            {lead.status !== 'CONVERTED' ? (
              <DropdownMenuItem onSelect={onConvert}>
                <ArrowRightLeft aria-hidden /> Convert…
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
