import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/pipelines/:id/stages — add a stage to this pipeline. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/pipelines/${id}/stages`, 'POST');
}
