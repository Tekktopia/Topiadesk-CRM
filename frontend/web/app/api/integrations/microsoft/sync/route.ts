import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST — run a delta sync immediately instead of waiting for the 15-minute sweep. */
export async function POST() {
  return proxyJson('/integrations/microsoft/sync', { method: 'POST' });
}
