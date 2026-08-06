import { portalProxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return portalProxyJson(`/portal/cases/${id}/comments`);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = await request.text();
  return portalProxyJson(`/portal/cases/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
