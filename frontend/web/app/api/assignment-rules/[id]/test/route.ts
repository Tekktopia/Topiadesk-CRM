import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/assignment-rules/:id/test -> POST /assignment-rules/:id/test (AssignmentRulesController.test) — dry-run, doesn't persist the round-robin cursor. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/assignment-rules/${id}/test`, { method: 'POST' });
}
