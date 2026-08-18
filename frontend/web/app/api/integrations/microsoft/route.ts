import type { NextRequest } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** PATCH — toggle calendar/mail sync independently. */
export async function PATCH(request: NextRequest) {
  const body = await request.text();
  return proxyJson('/integrations/microsoft', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

/** DELETE — disconnect and delete the stored tokens. */
export async function DELETE() {
  return proxyJson('/integrations/microsoft', { method: 'DELETE' });
}
