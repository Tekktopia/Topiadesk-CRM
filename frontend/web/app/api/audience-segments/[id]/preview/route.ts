import type { NextRequest } from 'next/server';
import { forwardBody } from '../../../campaigns/_shared';

export const runtime = 'nodejs';

/** POST /api/audience-segments/:id/preview — matching-contact count + sample; body may carry `filters` to preview unsaved edits. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/audience-segments/${id}/preview`, 'POST');
}
