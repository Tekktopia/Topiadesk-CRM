import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/surveys/:id -> GET /surveys/:id (SurveysController.findOne). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/surveys/${id}`);
}

/** PATCH /api/surveys/:id -> PATCH /surveys/:id (SurveysController.update). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/surveys/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
}
