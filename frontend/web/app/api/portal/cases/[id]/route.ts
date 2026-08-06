import { portalProxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return portalProxyJson(`/portal/cases/${id}`);
}
