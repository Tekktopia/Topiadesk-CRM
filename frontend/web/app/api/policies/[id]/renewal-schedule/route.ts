import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/policies/:id/renewal-schedule -> GET
 * /policies/:policyId/renewal-schedule (RenewalScheduleController.findOne).
 * 404s (via proxyJson passthrough) when the policy has no schedule yet —
 * the detail view treats that as "no schedule configured", not an error. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  return proxyJson(`/policies/${id}/renewal-schedule`);
}

/** POST /api/policies/:id/renewal-schedule -> POST
 * /policies/:policyId/renewal-schedule (create) — only valid once per
 * policy (schema's @unique policyId); used when a policy has no schedule
 * yet. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/renewal-schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

/**
 * PATCH /api/policies/:id/renewal-schedule -> PATCH
 * /policies/:policyId/renewal-schedule (RenewalScheduleController.update) —
 * the user-override surface: reassigning who chases the renewal
 * (`assignedToId`) and tuning `alertThresholds`/`renewalDueDate`. The
 * backend recomputes `nextAlertDueAt` server-side whenever either changes.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/policies/${id}/renewal-schedule`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
