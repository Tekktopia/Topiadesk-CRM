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
