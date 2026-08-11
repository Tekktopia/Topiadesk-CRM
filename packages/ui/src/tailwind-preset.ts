import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';
import { brand, gold, navy, slate, teal, violet } from './tokens';

/**
 * Shared Tailwind preset for the TopiaDesk design system. Consuming apps
 * (frontend/web) import this into their own `tailwind.config.ts` via
 * `presets: [uiPreset]` so the token set lives in exactly one place.
 *
 * Two color layers are exposed:
 *  - Static scales (`brand-50..950`, `gold-50..950`, `slate-50..950`) for
 *    direct utility use where a fixed hue is intentional regardless of
 *    theme (rare — prefer semantic tokens below for anything themeable).
 *  - Semantic tokens (`background`, `primary`, `destructive`, ...) that
 *    resolve to CSS custom properties defined in `styles/globals.css`,
 *    swapped per light/dark theme by the `.dark` class. Almost all UI
 *    code should use these, not the static scales.
 */
const withOpacity = (variable: string) => `hsl(var(${variable}) / <alpha-value>)`;

/** Wraps a hand-mirrored `"H S% L%"` triplet as a literal `hsl()` color for
 * Tailwind's static scales (brand/gold/slate) — these aren't theme-variable
 * driven, so they don't need the `<alpha-value>` indirection. */
const asHslScale = <T extends Record<string, string>>(scale: T): Record<keyof T, string> =>
  Object.fromEntries(Object.entries(scale).map(([shade, value]) => [shade, `hsl(${value})`])) as Record<
    keyof T,
    string
  >;

const uiPreset: Partial<Config> = {
  darkMode: ['class'],
  content: [],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        brand: asHslScale(brand),
        gold: asHslScale(gold),
        slate: asHslScale(slate),
        violet: asHslScale(violet),
        navy: asHslScale(navy),
        teal: asHslScale(teal),
        border: withOpacity('--border'),
        input: withOpacity('--input'),
        ring: withOpacity('--ring'),
        background: withOpacity('--background'),
        foreground: withOpacity('--foreground'),
        primary: {
          DEFAULT: withOpacity('--primary'),
          foreground: withOpacity('--primary-foreground'),
        },
        secondary: {
          DEFAULT: withOpacity('--secondary'),
          foreground: withOpacity('--secondary-foreground'),
        },
        destructive: {
          DEFAULT: withOpacity('--destructive'),
          foreground: withOpacity('--destructive-foreground'),
        },
        success: {
          DEFAULT: withOpacity('--success'),
          foreground: withOpacity('--success-foreground'),
        },
        warning: {
          DEFAULT: withOpacity('--warning'),
          foreground: withOpacity('--warning-foreground'),
        },
        muted: {
          DEFAULT: withOpacity('--muted'),
          foreground: withOpacity('--muted-foreground'),
        },
        accent: {
          DEFAULT: withOpacity('--accent'),
          foreground: withOpacity('--accent-foreground'),
        },
        popover: {
          DEFAULT: withOpacity('--popover'),
          foreground: withOpacity('--popover-foreground'),
        },
        card: {
          DEFAULT: withOpacity('--card'),
          foreground: withOpacity('--card-foreground'),
        },
      },
      // Every text-* utility at 92% of Tailwind's default scale (customer
      // feedback: first "reduce all the fonts by 20%" i.e. 80%, then a
      // follow-up "increase the font back by 15%" — 0.8 * 1.15 = 0.92).
      // Deliberately its own token here rather than shrinking the root
      // <html> font-size — the spacing/sizing scale (p-4, h-9, icon h-4
      // w-4, ...) is rem-based too and would shrink/grow right along with
      // text if the root size moved, which isn't what "the fonts" asked
      // for. Line-heights scaled by the same factor so leading stays
      // proportional to the resized type.
      fontSize: {
        xs: ['0.69rem', { lineHeight: '0.92rem' }],
        sm: ['0.805rem', { lineHeight: '1.15rem' }],
        base: ['0.92rem', { lineHeight: '1.38rem' }],
        lg: ['1.035rem', { lineHeight: '1.61rem' }],
        xl: ['1.15rem', { lineHeight: '1.61rem' }],
        '2xl': ['1.38rem', { lineHeight: '1.84rem' }],
        '3xl': ['1.725rem', { lineHeight: '2.07rem' }],
        '4xl': ['2.07rem', { lineHeight: '2.3rem' }],
        '5xl': ['2.76rem', { lineHeight: '1' }],
        '6xl': ['3.45rem', { lineHeight: '1' }],
        '7xl': ['4.14rem', { lineHeight: '1' }],
        '8xl': ['5.52rem', { lineHeight: '1' }],
        '9xl': ['7.36rem', { lineHeight: '1' }],
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
      },
      // Soft, cascading elevation (Microsoft 365/Fluent-style: panels float
      // via shadow, not a border line — customer feedback: "no border,
      // classic cascade, Microsoft style"). Each tier stacks two layers —
      // a tight, darker "contact" shadow close to the edge plus a larger,
      // softer "ambient" shadow further out — the standard two-layer
      // technique that reads as a diffused, cascading shadow rather than a
      // flat single-offset line. Every consumer still references
      // brand-sm/md/lg (unchanged call sites across
      // packages/ui/src/primitives/**), only the values changed; border
      // classes were removed from the container/popup primitives that use
      // these (Card, DataTable's wrapper, Dialog, DropdownMenu/Select
      // content, Tooltip) so the shadow is what now defines their edge.
      // Form controls (Input/Select trigger/Button outline) keep their
      // thin `border-input` — Fluent's own text fields/comboboxes still
      // rely on a visible boundary for interactivity, this change is about
      // panels/popups, not controls.
      boxShadow: {
        'brand-sm': '0 1px 2px 0 hsl(var(--foreground) / 0.06), 0 1px 3px 1px hsl(var(--foreground) / 0.06)',
        'brand-md': '0 1px 2px 0 hsl(var(--foreground) / 0.08), 0 4px 12px 2px hsl(var(--foreground) / 0.10)',
        'brand-lg': '0 2px 6px 0 hsl(var(--foreground) / 0.10), 0 12px 32px 4px hsl(var(--foreground) / 0.16)',
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default uiPreset;
