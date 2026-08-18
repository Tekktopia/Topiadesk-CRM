import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson, proxyMultipart, proxyStream } from '../../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/org-settings/branding/logo -> GET /identity/branding/logo (TenantBrandingController.get) — streamed, not proxyJson (binary image body). */
export async function GET(): Promise<NextResponse> {
  return proxyStream('/identity/branding/logo');
}

/** POST /api/admin/org-settings/branding/logo -> POST /identity/branding/logo (TenantBrandingController.upload, multipart field "file"). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxyMultipart('/identity/branding/logo', request);
}

/** DELETE /api/admin/org-settings/branding/logo -> DELETE /identity/branding/logo (TenantBrandingController.remove). */
export async function DELETE(): Promise<NextResponse> {
  return proxyJson('/identity/branding/logo', { method: 'DELETE' });
}
