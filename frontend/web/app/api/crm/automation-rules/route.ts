import type { NextRequest } from 'next/server';
import { forwardBody, proxyJson } from '../_shared';

export const runtime = 'nodejs';

/** GET /api/crm/automation-rules — list, optional ?triggerType=ENTITY_EVENT|SCHEDULE
 * forwarded as-is (AutomationRulesController.list). ENTITY_EVENT is Zendesk's
 * "Trigger" (real-time, fires on a record event), SCHEDULE is its "Automation"
 * (time-based scan) — see app/(admin)/admin/triggers and .../automations. */
export async function GET(request: NextRequest) {
  return proxyJson(`/crm/automation-rules${request.nextUrl.search}`);
}

/** POST /api/crm/automation-rules — create (AutomationRulesController.create, CreateAutomationRuleDto). */
export async function POST(request: NextRequest) {
  return forwardBody(request, '/crm/automation-rules', 'POST');
}
