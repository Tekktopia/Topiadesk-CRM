import { portalProxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return portalProxyJson('/portal/cases');
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  return portalProxyJson('/portal/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
