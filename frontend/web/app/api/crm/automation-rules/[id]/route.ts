import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/automation-rules/:id -> GET /crm/automation-rules/:id (AutomationRulesController.getOne). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/automation-rules/${id}`);
}

/** PATCH /api/crm/automation-rules/:id -> PATCH /crm/automation-rules/:id (AutomationRulesController.update, UpdateAutomationRuleDto). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBody(request, `/crm/automation-rules/${id}`, 'PATCH');
}

/** DELETE /api/crm/automation-rules/:id -> DELETE /crm/automation-rules/:id (AutomationRulesController.remove). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/automation-rules/${id}`, { method: 'DELETE' });
}
