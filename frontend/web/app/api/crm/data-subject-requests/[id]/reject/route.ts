import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../_shared';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/data-subject-requests/${id}/reject`, 'POST');
}
