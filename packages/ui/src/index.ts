/**
 * @topiadesk/ui — TopiaDesk CRM shared design system.
 *
 * Ships raw TS/TSX source (no build step, `main`/`types` point straight at
 * `src/index.ts`) — consuming Next.js apps must add this package to
 * `transpilePackages` in `next.config.mjs` so SWC compiles the JSX. See
 * frontend/web/next.config.mjs.
 */

// -- Design tokens ----------------------------------------------------------
export * from './tokens';
export { default as uiTailwindPreset } from './tailwind-preset';

// -- Utilities ----------------------------------------------------------------
export * from './lib/utils';

// -- Primitives (shadcn/ui-based) --------------------------------------------
export * from './primitives/avatar';
export * from './primitives/badge';
export * from './primitives/button';
export * from './primitives/card';
export * from './primitives/dialog';
export * from './primitives/dropdown-menu';
export * from './primitives/form';
export * from './primitives/input';
export * from './primitives/label';
export * from './primitives/select';
export * from './primitives/separator';
export * from './primitives/skeleton';
export * from './primitives/sonner';
export * from './primitives/table';
export * from './primitives/tabs';
export * from './primitives/tooltip';

// -- Composite components -----------------------------------------------------
export * from './composite/stat-tile';
