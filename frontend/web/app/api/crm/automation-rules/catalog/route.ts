import { proxyJson } from '../../_shared';

export const runtime = 'nodejs';

/**
 * GET /api/crm/automation-rules/catalog — the entity types, fields, actions
 * and schedule presets the rule builder renders itself from.
 *
 * Served from the backend rather than duplicated in the frontend so what the
 * builder offers cannot drift from what the engine supports — the drift that
 * let the old JSON-textarea UI accept a field name the matcher then ignored.
 */
export async function GET() {
  return proxyJson('/crm/automation-rules/catalog');
}
