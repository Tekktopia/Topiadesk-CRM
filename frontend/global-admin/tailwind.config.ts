import type { Config } from 'tailwindcss';
import uiPreset from '@topiadesk/ui/tailwind-preset';

const config: Config = {
  darkMode: ['class'],
  presets: [uiPreset],
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};

export default config;
