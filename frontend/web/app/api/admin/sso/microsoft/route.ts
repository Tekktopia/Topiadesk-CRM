import type { NextRequest } from 'next/server';
import { proxy, proxyWithBody } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/sso/microsoft -> GET /identity/sso/microsoft (MicrosoftSsoController.get). */
export async function GET() {
  return proxy('/identity/sso/microsoft');
}

/** PUT /api/admin/sso/microsoft -> PUT /identity/sso/microsoft (MicrosoftSsoController.upsert). */
export async function PUT(request: NextRequest) {
  return proxyWithBody(request, '/identity/sso/microsoft', 'PUT');
}

/** DELETE /api/admin/sso/microsoft -> DELETE /identity/sso/microsoft (MicrosoftSsoController.remove). */
export async function DELETE() {
  return proxy('/identity/sso/microsoft', { method: 'DELETE' });
}
