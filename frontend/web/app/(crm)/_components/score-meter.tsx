'use client';

import * as React from 'react';
import { cn } from '@topiadesk/ui';

/**
 * Shared 0-100 score visual, used by BOTH Lead.score and
 * Opportunity.dealHealthScore. Those are different measures with different
 * vocabulary ("hot/warm/cold" vs "healthy/at risk/critical") but they band
 * identically at 70 and 40 — constants.ts's dealHealthScoreVariant() already
 * hardcoded the same two numbers independently, which is exactly the kind of
 * duplicated threshold that drifts the moment one of them is tuned. The
 * numbers live here now; callers supply their own wording.
 *
 * Why a track and not the Badge this replaced: score is the field these
 * pages are triaged by, and a badge renders identically at 12 and 87 — a
 * number in a pill is not comparable down a column at a glance.
 */
export const HIGH_SCORE_THRESHOLD = 70;
export const MID_SCORE_THRESHOLD = 40;

export type ScoreBand = 'high' | 'mid' | 'low';

export function scoreBand(score: number): ScoreBand {
  if (score >= HIGH_SCORE_THRESHOLD) return 'high';
  if (score >= MID_SCORE_THRESHOLD) return 'mid';
  return 'low';
}

/** Lead vocabulary. */
export function leadScoreBandLabel(score: number): string {
  return { high: 'Hot', mid: 'Warm', low: 'Cold' }[scoreBand(score)];
}

/** Opportunity vocabulary — null means the deal-health job hasn't scored it (or it's already decided). */
export function dealHealthBandLabel(score: number | null): string {
  if (score === null) return 'Not scored';
  return { high: 'Healthy', mid: 'At risk', low: 'Critical' }[scoreBand(score)];
}

// Semantic (good / attention / inert), deliberately separate from the brand
// accent — the same convention the dashboard's charts follow.
const TRACK_FILL: Record<ScoreBand, string> = {
  high: 'bg-emerald-500',
  mid: 'bg-amber-500',
  low: 'bg-slate-400',
};

const TEXT_TONE: Record<ScoreBand, string> = {
  high: 'text-emerald-600 dark:text-emerald-400',
  mid: 'text-amber-600 dark:text-amber-400',
  low: 'text-muted-foreground',
};

export function ScoreMeter({
  score,
  className,
  ariaLabel,
}: {
  score: number;
  className?: string;
  /** Domain wording for screen readers, e.g. "Score 88 of 100 — Hot". */
  ariaLabel?: string;
}) {
  // Defensive clamp: both columns are Int 0-100 in the schema, but a bad
  // import or a retuned scoring rule shouldn't render a bar wider than its
  // own track.
  const clamped = Math.max(0, Math.min(100, score));
  const band = scoreBand(clamped);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={ariaLabel ?? `Score ${clamped} of 100`}
      >
        <div className={cn('h-full rounded-full transition-all', TRACK_FILL[band])} style={{ width: `${clamped}%` }} />
      </div>
      <span className={cn('w-7 text-right text-xs font-semibold tabular-nums', TEXT_TONE[band])}>{clamped}</span>
    </div>
  );
}

/**
 * Larger circular variant for detail-page headers, where the score is the
 * headline fact rather than one cell among many. Pure SVG — no chart library
 * for a single arc, and it stays crisp at any DPI.
 */
export function ScoreRing({ score, className, ariaLabel }: { score: number; className?: string; ariaLabel?: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const band = scoreBand(clamped);
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  const STROKE: Record<ScoreBand, string> = {
    high: 'stroke-emerald-500',
    mid: 'stroke-amber-500',
    low: 'stroke-slate-400',
  };

  return (
    <div className={cn('relative inline-flex h-16 w-16 items-center justify-center', className)}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={radius} className="fill-none stroke-muted" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          className={cn('fill-none transition-all', STROKE[band])}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <span className="absolute text-base font-semibold tabular-nums text-foreground">{clamped}</span>
      <span className="sr-only">{ariaLabel ?? `Score ${clamped} of 100`}</span>
    </div>
  );
}
