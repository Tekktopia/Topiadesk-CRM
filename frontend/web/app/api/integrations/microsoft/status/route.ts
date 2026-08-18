import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/integrations/microsoft/status — this user's own mailbox link. */
export async function GET() {
  return proxyJson('/integrations/microsoft/status');
}
