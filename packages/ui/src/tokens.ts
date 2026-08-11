/**
 * TopiaDesk brand design tokens — single source of truth for the color
 * scale, radius, and shadow primitives that back the design system.
 *
 * Consumed by `tailwind-preset.ts` (as static Tailwind `theme.extend`
 * colors, e.g. `bg-brand-600`). The *semantic* tokens layered on top of
 * these (background/foreground/primary/destructive/etc.) live as CSS
 * custom properties in `styles/globals.css` so they can vary between
 * light/dark themes at runtime without a JS re-render — see that file's
 * `:root` / `.dark` blocks. If you change a hue/value here, update
 * globals.css's `--primary` / `--accent` to match (same hand-mirrored
 * convention as packages/shared-types/src/enums.ts — no build step wires
 * these together automatically).
 *
 * Palette rationale: this is an insurance-brokerage CRM competing with
 * Freshdesk/Zendesk for enterprise buyers — "petrol" (a deep, desaturated
 * blue-teal) reads as precise, stable, and trustworthy without landing on
 * the generic SaaS purple/indigo cliché. "Gold" is a restrained accent
 * reserved for premium/priority/attention signal (e.g. a renewal-at-risk
 * flag, a VIP account badge) — it is never used as a primary action color.
 * Values are HSL triplets ("H S% L%", no `hsl()` wrapper) so Tailwind's
 * `hsl(var(--x) / <alpha-value>)` pattern supports opacity modifiers like
 * `bg-primary/10`.
 *
 * `violet`/`navy`/`teal` (below) are a deliberate, curated exception to
 * "one brand hue" — added specifically for dashboard KPI-tile gradients and
 * pie/donut chart category identity (see chart-theme.ts's categoricalColor
 * and CATEGORICAL_GRADIENTS), where a single hue can't distinguish 4+
 * unordered categories. `brand` itself fills the "blue" slot in that
 * 4-hue rotation rather than gaining a sibling — a distinct 4th blue hue
 * validated as visually indistinguishable from brand's own petrol. These
 * three stay reserved for that categorical/chart use, not general-purpose
 * utility classes the way `brand`/`gold` are.
 */

export const brand = {
  50: '195 60% 97%',
  100: '195 55% 93%',
  200: '196 52% 85%',
  300: '197 50% 72%',
  400: '198 52% 56%',
  500: '199 62% 40%',
  600: '200 68% 32%',
  700: '201 70% 26%',
  800: '202 65% 20%',
  900: '203 60% 15%',
  950: '204 55% 9%',
} as const;

export const gold = {
  50: '43 80% 96%',
  100: '42 75% 90%',
  200: '41 72% 80%',
  300: '39 68% 68%',
  400: '38 65% 58%',
  500: '36 62% 48%',
  600: '34 65% 40%',
  700: '32 68% 32%',
  800: '30 62% 25%',
  900: '28 55% 18%',
  950: '27 50% 10%',
} as const;

export const violet = {
  50: '260 70% 97%',
  100: '260 65% 93%',
  200: '261 60% 86%',
  300: '262 55% 76%',
  400: '262 52% 66%',
  500: '262 50% 56%',
  600: '263 55% 46%',
  700: '264 60% 38%',
  800: '265 62% 29%',
  900: '266 58% 20%',
  950: '267 52% 12%',
} as const;

export const navy = {
  50: '228 90% 97%',
  100: '229 85% 93%',
  200: '230 82% 87%',
  300: '231 80% 78%',
  400: '231 82% 66%',
  500: '232 85% 54%',
  600: '233 82% 46%',
  700: '234 78% 38%',
  800: '235 72% 29%',
  900: '236 65% 20%',
  950: '237 58% 12%',
} as const;

/** `700` (not `500`) is the step to use under white tile text — `500` fails white-text contrast. */
export const teal = {
  50: '162 65% 96%',
  100: '163 60% 91%',
  200: '163 58% 82%',
  300: '164 58% 68%',
  400: '164 60% 55%',
  500: '164 60% 42%',
  600: '164 62% 36%',
  700: '164 62% 30%',
  800: '165 60% 23%',
  900: '166 55% 16%',
  950: '167 50% 9%',
} as const;

/** Neutral grayscale with a faint cool undertone matching `brand`'s hue. */
export const slate = {
  50: '204 20% 98%',
  100: '204 18% 95%',
  200: '203 16% 89%',
  300: '203 14% 80%',
  400: '203 12% 64%',
  500: '203 12% 48%',
  600: '203 15% 36%',
  700: '203 18% 27%',
  800: '204 22% 18%',
  900: '204 30% 11%',
  950: '204 40% 6%',
} as const;

export const radius = {
  sm: 'calc(var(--radius) - 4px)',
  md: 'calc(var(--radius) - 2px)',
  lg: 'var(--radius)',
  xl: 'calc(var(--radius) + 4px)',
} as const;

export type BrandScale = typeof brand;
export type ColorShade = keyof BrandScale;
