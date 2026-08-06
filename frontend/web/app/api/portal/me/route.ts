import { portalProxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return portalProxyJson('/portal/me');
}
