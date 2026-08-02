import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/leads/:id/convert — the lead-to-Account+Opportunity conversion flow. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/leads/${id}/convert`, 'POST');
}
