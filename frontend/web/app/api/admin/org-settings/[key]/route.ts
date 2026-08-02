import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../../_lib/proxy';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return proxy(`/identity/org-settings/${encodeURIComponent(key)}`);
}

/** PUT /api/admin/org-settings/:key — body: { value: unknown } (arbitrary
 * JSON — the backend deliberately doesn't special-case any key, see
 * OrgSettingsController's header comment). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return proxyWithBody(request, `/identity/org-settings/${encodeURIComponent(key)}`, 'PUT');
}
