import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';
import { brand, gold, slate } from './tokens';

/**
 * Shared Tailwind preset for the TopiaDesk design system. Consuming apps
 * (apps/web) import this into their own `tailwind.config.ts` via
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
      padding: '1.5rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        brand: asHslScale(brand),
        gold: asHslScale(gold),
        slate: asHslScale(slate),
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
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
      },
      boxShadow: {
        'brand-sm': '0 1px 2px 0 hsl(var(--foreground) / 0.04)',
        'brand-md': '0 4px 12px -2px hsl(var(--foreground) / 0.08), 0 2px 4px -2px hsl(var(--foreground) / 0.04)',
        'brand-lg': '0 12px 24px -6px hsl(var(--foreground) / 0.10), 0 4px 8px -4px hsl(var(--foreground) / 0.06)',
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
