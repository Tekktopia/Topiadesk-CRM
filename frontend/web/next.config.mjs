import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by frontend/web/Dockerfile's multi-stage build (copies
  // .next/standalone + .next/static — see that file's header comment).
  output: 'standalone',

  // packages/ui and packages/shared-types ship raw TS/TSX source (no build
  // step — see their package.json `main`/`exports`), so Next's SWC compiler
  // must be told to transpile them explicitly; without this, importing JSX
  // from @topiadesk/ui would fail to compile.
  transpilePackages: ['@topiadesk/ui', '@topiadesk/shared-types'],

  eslint: {
    // `pnpm lint` (the turbo `lint` task) already runs ESLint standalone;
    // don't duplicate that work inside `next build`.
    ignoreDuringBuilds: true,
  },

  // Pin the monorepo root explicitly so Next's file-tracing doesn't have to
  // infer it from lockfile locations (pnpm-lock.yaml lives two levels up).
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
