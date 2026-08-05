import type { WebhookEventType } from '@topiadesk/db';

type ChangedFields = Record<string, { old?: unknown; new?: unknown }> | null | undefined;

function newValueOf(changedFields: ChangedFields, column: string): unknown {
  return changedFields ? changedFields[column]?.new : undefined;
}

/**
 * Explicit (entity_type, action[, changed_fields]) -> WebhookEventType
 * lookup — reuses the audit trigger's already-comprehensive row-change
 * coverage (prisma/triggers/002_audit_chain_triggers.sql) as the single
 * source of truth for "what changed", rather than hand-wiring an emit call
 * into every service (exactly the "could forget to call it" failure mode
 * the audit trigger itself exists to avoid — see schema.prisma's Phase 2
 * header comment).
 *
 * `entityType` is a Postgres table name (TG_TABLE_NAME — the trigger fires
 * per table, snake_case, not per Prisma model), and `changedFields` is the
 * trigger's own `{column: {old, new}}` diff, with COLUMN names (also
 * snake_case — `to_jsonb(NEW)` reflects real Postgres columns, not
 * Prisma's `@map`-renamed model fields — e.g. `pipeline_stage_id`, not
 * `pipelineStageId`). Inspected here wherever a bare CREATE/UPDATE action
 * is too coarse on its own (e.g. "any policies UPDATE" would fire for
 * every field edit, not specifically a BOUND/CANCELLED/RENEWED transition).
 *
 * Not every status/table combination has a matching WebhookEventType (e.g.
 * Policy's QUOTED/ISSUED/ENDORSED/LAPSED transitions have none) — those
 * rows are simply unmapped, not an oversight; there's no enum value to map
 * them to.
 */
export function mapAuditRowToWebhookEventType(entityType: string, action: string, changedFields: ChangedFields): WebhookEventType | undefined {
  if (entityType === 'accounts') {
    if (action === 'CREATE') return 'ACCOUNT_CREATED';
    if (action === 'UPDATE') return 'ACCOUNT_UPDATED';
  }
  if (entityType === 'opportunities' && action === 'UPDATE' && changedFields && 'pipeline_stage_id' in changedFields) {
    return 'OPPORTUNITY_STAGE_CHANGED';
  }
  if (entityType === 'policies' && action === 'UPDATE') {
    const status = newValueOf(changedFields, 'status');
    if (status === 'BOUND') return 'POLICY_BOUND';
    if (status === 'CANCELLED') return 'POLICY_CANCELLED';
    if (status === 'RENEWED') return 'POLICY_RENEWED';
  }
  if (entityType === 'premiums' && action === 'UPDATE' && newValueOf(changedFields, 'status') === 'OVERDUE') {
    return 'PREMIUM_OVERDUE';
  }
  if (entityType === 'documents' && action === 'CREATE') return 'DOCUMENT_UPLOADED';
  if (entityType === 'tasks' && action === 'UPDATE' && newValueOf(changedFields, 'status') === 'COMPLETED') {
    return 'TASK_COMPLETED';
  }
  if (entityType === 'approvals' && action === 'UPDATE') {
    const status = newValueOf(changedFields, 'status');
    if (status === 'APPROVED' || status === 'REJECTED') return 'APPROVAL_DECIDED';
  }
  if (entityType === 'claims' && action === 'UPDATE' && changedFields && 'status' in changedFields) {
    return 'CLAIM_STATUS_CHANGED';
  }
  if (entityType === 'cases' && action === 'UPDATE' && changedFields && 'status' in changedFields) {
    return 'CASE_STATUS_CHANGED';
  }
  return undefined;
}
