import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/sla-policies/:id/targets -> POST /sla-policies/:id/targets (SlaPoliciesController.addTarget, CreateSlaTargetDto). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/sla-policies/${id}/targets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}
