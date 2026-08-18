import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/activities/:id */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/activities/${id}`);
}

/** PATCH /api/crm/activities/:id — correct a mis-logged activity (see the controller). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/activities/${id}`, 'PATCH');
}

/** DELETE /api/crm/activities/:id — remove one logged in error. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/activities/${id}`, { method: 'DELETE' });
}
