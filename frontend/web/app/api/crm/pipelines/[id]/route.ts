import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/pipelines/:id — pipeline + its ordered PipelineStages, feeds the Kanban board's columns. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/pipelines/${id}`);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/pipelines/${id}`, 'PATCH');
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/pipelines/${id}`, { method: 'DELETE' });
}
