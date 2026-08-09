import type { Config } from 'tailwindcss';
import uiPreset from '@topiadesk/ui/tailwind-preset';

/**
 * App-local additions on top of the shared @topiadesk/ui preset — kept
 * here (not in packages/ui/src/tailwind-preset.ts) specifically so the
 * "glassy mission control" redesign stays scoped to this app and never
 * leaks into frontend/web, which shares the same preset file. `extend`
 * merges additively with the preset's own `extend`, so nothing here
 * overrides frontend/web's tokens — it only adds new ones this app uses.
 */
const config: Config = {
  darkMode: ['class'],
  presets: [uiPreset],
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        // Soft colored glows for hover/active states on the new glass
        // surfaces — additive to the shared shadow-brand-* (neutral)
        // elevation tiers, never replacing them.
        'glow-primary': '0 0 0 1px hsl(var(--primary) / 0.15), 0 0 24px 0 hsl(var(--primary) / 0.25)',
        'glow-accent': '0 0 0 1px hsl(var(--accent) / 0.15), 0 0 24px 0 hsl(var(--accent) / 0.25)',
        'glow-success': '0 0 0 1px hsl(var(--success) / 0.15), 0 0 20px 0 hsl(var(--success) / 0.22)',
        'glow-destructive': '0 0 0 1px hsl(var(--destructive) / 0.15), 0 0 20px 0 hsl(var(--destructive) / 0.22)',
        'glow-warning': '0 0 0 1px hsl(var(--warning) / 0.15), 0 0 20px 0 hsl(var(--warning) / 0.22)',
      },
      backgroundImage: {
        // Faint instrument-panel dot grid for the main content area —
        // inline SVG data URI, no network fetch, no new asset file.
        'dot-grid':
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='1.5' cy='1.5' r='1.5' fill='%23ffffff' fill-opacity='0.06'/%3E%3C/svg%3E\")",
      },
    },
  },
};

export default config;
