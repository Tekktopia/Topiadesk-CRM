import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by frontend/global-admin/Dockerfile's multi-stage build —
  // same "standalone output" pattern as frontend/web (see that app's
  // next.config.mjs for the full reasoning).
  output: 'standalone',
  transpilePackages: ['@topiadesk/ui'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
