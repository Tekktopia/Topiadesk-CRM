#!/usr/bin/env node
// Generates a typed API client from the running API's OpenAPI spec.
// Run after the api service is up: `pnpm --filter @topiadesk/shared-types generate:api-client`
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
const outDir = join(__dirname, '..', 'src', 'api-client');

async function main() {
  const specUrl = `${apiUrl}/api/docs-json`;
  console.log(`[generate-api-client] fetching ${specUrl}`);
  // openapi-typescript v7's default export returns a TS AST (array of
  // nodes), not a string — astToString() is the separate step that
  // serializes it. (Bug fix: this file previously imported the default
  // export under the name `astToString` and passed its AST result straight
  // to writeFileSync, which fails with "data argument must be of type
  // string... Received an instance of Array" on any v7.x install.)
  const ast = await openapiTS(new URL(specUrl));
  const output = COMMENT_HEADER + astToString(ast);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'schema.d.ts'), output);
  console.log(`[generate-api-client] wrote src/api-client/schema.d.ts`);
}

main().catch((err) => {
  console.error('[generate-api-client] failed:', err.message);
  console.error('Is the api service running and reachable at', apiUrl, '?');
  process.exit(1);
});
