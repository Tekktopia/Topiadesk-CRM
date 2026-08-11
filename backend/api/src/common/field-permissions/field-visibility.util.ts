/**
 * Field-Level Security enforcement — resolves and applies FieldPermission
 * rows (see schema.prisma's own comment on that model for the full design
 * rationale: opt-in/additive, most-permissive-across-roles composition,
 * fixed per-resource field allowlists enforced here rather than an open
 * field name).
 */
import { ForbiddenException } from '@nestjs/common';
import { getPrismaClient } from '@topiadesk/db';
import type { AuthenticatedUser } from '../auth/authenticated-user';

export type FieldVisibility = 'HIDDEN' | 'READ_ONLY' | 'EDITABLE';

/** Only fields listed here can ever be gated — same "fixed keys, not an open query" convention as SavedView.filters. Extend when a new sensitive field needs FLS coverage. */
export const FIELD_PERMISSION_CATALOG: Record<string, string[]> = {
  account: ['naicomId'],
  contact: ['idNumber', 'idType'],
  premium: ['commissionRate', 'commissionAmount'],
};

const VISIBILITY_RANK: Record<FieldVisibility, number> = { HIDDEN: 0, READ_ONLY: 1, EDITABLE: 2 };

/** Effective visibility per field for this caller — the MOST permissive value across all their roles (a role with no row contributes EDITABLE), matching app_max_scope()'s union-of-roles composition. */
export async function resolveFieldVisibilities(user: AuthenticatedUser, resource: string): Promise<Record<string, FieldVisibility>> {
  const fields = FIELD_PERMISSION_CATALOG[resource] ?? [];
  const result: Record<string, FieldVisibility> = {};
  for (const field of fields) result[field] = 'EDITABLE';
  if (fields.length === 0 || user.roleIds.length === 0) return result;

  const rows = await getPrismaClient().fieldPermission.findMany({
    where: { roleId: { in: user.roleIds }, resource, fieldName: { in: fields } },
  });
  const rowsByField = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = rowsByField.get(row.fieldName) ?? [];
    list.push(row);
    rowsByField.set(row.fieldName, list);
  }

  for (const field of fields) {
    const rowsForField = rowsByField.get(field) ?? [];
    let best: FieldVisibility = 'HIDDEN';
    for (const roleId of user.roleIds) {
      const visibility = rowsForField.find((r) => r.roleId === roleId)?.visibility ?? 'EDITABLE';
      if (VISIBILITY_RANK[visibility] > VISIBILITY_RANK[best]) best = visibility;
    }
    result[field] = best;
  }
  return result;
}

/**
 * Strips HIDDEN fields off a response row (in place on a shallow clone) —
 * READ_ONLY fields stay visible, only their writability is restricted (see
 * assertFieldsWritable). `T extends object` (not `Record<string, unknown>`)
 * — every real call site passes a class instance (a DTO/Prisma model
 * type), which has no index signature; deleting by key name still works
 * fine at runtime regardless of the static shape.
 */
export function redactHiddenFields<T extends object>(row: T, visibilities: Record<string, FieldVisibility>): T {
  const clone = { ...row } as Record<string, unknown>;
  for (const [field, visibility] of Object.entries(visibilities)) {
    if (visibility === 'HIDDEN') delete clone[field];
  }
  return clone as T;
}

export function redactHiddenFieldsMany<T extends object>(rows: T[], visibilities: Record<string, FieldVisibility>): T[] {
  return rows.map((row) => redactHiddenFields(row, visibilities));
}

/** Throws if the caller's DTO body touches any field that isn't EDITABLE for them — call before the write, with the raw request body (not the persisted row) so an omitted field never trips this. */
export function assertFieldsWritable(body: object, visibilities: Record<string, FieldVisibility>): void {
  const blocked = Object.keys(body).filter((field) => field in visibilities && visibilities[field] !== 'EDITABLE');
  if (blocked.length > 0) {
    throw new ForbiddenException(`You don't have permission to modify: ${blocked.join(', ')}`);
  }
}
