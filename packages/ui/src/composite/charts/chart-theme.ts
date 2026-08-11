import { brand, gold, navy, teal, violet } from '../../tokens';

/**
 * Recharts consumes plain CSS color strings for `fill`/`stroke` — not
 * Tailwind class names — so this re-derives the same ordinal ramp
 * convention `frontend/web/app/(reports)/_lib/chart.ts`'s
 * `BRAND_ORDINAL_RAMP` already established (light→dark by position, since
 * this design system has exactly one brand hue plus a reserved gold accent
 * — see tokens.ts's header comment — not a general-purpose categorical
 * palette to draw arbitrary hues from) as literal `hsl()` strings instead
 * of Tailwind classes.
 */
export const BRAND_RAMP = [brand[300], brand[400], brand[500], brand[600], brand[700], brand[800]].map((v) => `hsl(${v})`);
export const GOLD_RAMP = [gold[300], gold[400], gold[500], gold[600], gold[700], gold[800]].map((v) => `hsl(${v})`);

/** Maps a 0-indexed ordinal position (rank, sequence, stage order) onto the brand ramp, light→dark — "further along reads as darker." */
export function ordinalColor(index: number, total: number): string {
  const step = total <= 1 ? BRAND_RAMP.length - 1 : Math.round((index / (total - 1)) * (BRAND_RAMP.length - 1));
  return BRAND_RAMP[step]!;
}

/** Alternates brand/gold ramps for a second visually-distinct series (stacked bar, treemap, combo) — same "no fabricated hues" reasoning as ordinalColor. */
export function seriesColor(index: number): string {
  const ramp = index % 2 === 0 ? BRAND_RAMP : GOLD_RAMP;
  return ramp[Math.floor(index / 2) % ramp.length]!;
}

/**
 * Fixed-order categorical ramp for genuinely nominal identity (KPI tile
 * accents, pie/donut slice fill) — NOT rank/sequence, which stays on
 * ordinalColor's single-hue light→dark convention above. `brand` fills the
 * "blue" slot (see tokens.ts's header note — a 4th distinct blue hue reads
 * as indistinguishable from brand's own petrol).
 *
 * Only 4 slots exist. Never index past 4 for chart slice identity — fold
 * smaller categories into an "Other" bucket at the data-prep layer first
 * (report-chart.tsx's toStackedDatums has the existing cap-and-fold
 * pattern to copy). Cycling past 4 is only acceptable for self-labeled,
 * decorative KPI tile accents, where color isn't the identity channel.
 */
export const CATEGORICAL_RAMP = [violet[500], navy[500], brand[500], teal[500]].map((v) => `hsl(${v})`);
export function categoricalColor(index: number): string {
  return CATEGORICAL_RAMP[index % CATEGORICAL_RAMP.length]!;
}

/** KPI-tile two-stop gradient per categorical slot — consumed by GradientStatTile's `accent` variant. `teal` uses its 600/800 steps (not 500/700 like the others) since teal-500 fails white-text contrast. */
export const CATEGORICAL_GRADIENTS = {
  violet: [violet[500], violet[700]],
  navy: [navy[500], navy[700]],
  blue: [brand[500], brand[700]],
  teal: [teal[600], teal[800]],
} as const;

export type Severity = 'good' | 'warning' | 'critical';

export function severityFromPercent(valuePercent: number): Severity {
  return valuePercent >= 80 ? 'good' : valuePercent >= 50 ? 'warning' : 'critical';
}

/**
 * Same-hue track-and-fill convention (see the gauge's own doc comment:
 * "blue-on-blue... so state reads across the whole bar", i.e. the unfilled
 * track is a lighter step of the *same* hue as the fill, never a generic
 * muted gray). Reads through the `--success`/`--warning`/`--destructive`
 * CSS custom properties (`styles/globals.css`) rather than tokens.ts's
 * static scale, so severity color automatically tracks light/dark mode —
 * unlike the ordinal/series ramps above, these ARE theme-variant.
 */
export function severityColor(severity: Severity): { fill: string; track: string } {
  switch (severity) {
    case 'good':
      return { fill: 'hsl(var(--success))', track: 'hsl(var(--success) / 0.15)' };
    case 'warning':
      return { fill: 'hsl(var(--warning))', track: 'hsl(var(--warning) / 0.15)' };
    case 'critical':
      return { fill: 'hsl(var(--destructive))', track: 'hsl(var(--destructive) / 0.15)' };
  }
}

export const MUTED_TEXT = 'hsl(var(--muted-foreground))';
export const FOREGROUND_TEXT = 'hsl(var(--foreground))';
export const BORDER_COLOR = 'hsl(var(--border))';
