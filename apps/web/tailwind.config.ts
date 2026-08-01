import type { Config } from 'tailwindcss';
import uiPreset from '@topiadesk/ui/tailwind-preset';

/**
 * apps/web's Tailwind config just supplies content globs and pulls in the
 * shared token set from `@topiadesk/ui` as a preset — the actual color
 * scale/radius/shadow/plugin definitions live in exactly one place
 * (packages/ui/src/tailwind-preset.ts). Route groups added by later Batch 2
 * agents (`app/(crm)/**`, `app/(policy)/**`, `app/(admin)/**`) are already
 * covered by the `./app/**` glob below — no changes needed here per group.
 */
const config: Config = {
  darkMode: ['class'],
  presets: [uiPreset],
  content: [
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
