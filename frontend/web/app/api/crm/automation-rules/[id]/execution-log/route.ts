import type { NextRequest } from 'next/server';
import { proxyJson } from '../../../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/automation-rules/:id/execution-log -> GET /crm/automation-rules/:id/execution-log (AutomationRulesController.executionLog). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(`/crm/automation-rules/${id}/execution-log`);
}
