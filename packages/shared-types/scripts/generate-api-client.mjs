#!/usr/bin/env node
// Generates a typed API client from the running API's OpenAPI spec.
// Run after the api service is up: `pnpm --filter @topiadesk/shared-types generate:api-client`
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import astToString from 'openapi-typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
const outDir = join(__dirname, '..', 'src', 'api-client');

async function main() {
  const specUrl = `${apiUrl}/api/docs-json`;
  console.log(`[generate-api-client] fetching ${specUrl}`);
  const ast = await astToString(new URL(specUrl));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'schema.d.ts'), ast);
  console.log(`[generate-api-client] wrote src/api-client/schema.d.ts`);
}

main().catch((err) => {
  console.error('[generate-api-client] failed:', err.message);
  console.error('Is the api service running and reachable at', apiUrl, '?');
  process.exit(1);
});
