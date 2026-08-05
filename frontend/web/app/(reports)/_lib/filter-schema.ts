/**
 * Derives a form field descriptor list from a report's `filterSchema` (JSON
 * Schema, converted server-side from the report's own zod schema — see
 * reports.controller.ts's `toReportCatalogEntryDto`). This is the ONLY
 * source DynamicFilterForm reads field names/types from — there is no
 * free-text "raw filter JSON" escape hatch anywhere in this module. Every
 * key that ends up in a submitted filters object is one the backend's own
 * schema declared, and `buildFiltersPayload` only ever sets values under
 * those exact keys, so this can't be used to smuggle an arbitrary field
 * name into the request body (the backend re-validates with `.strict()`
 * regardless, but the UI doesn't even offer the shape to try).
 */
import { humanizeKey } from './format';
import type { JsonSchemaObject, JsonSchemaProperty } from './types';

export type FilterFieldKind = 'text' | 'uuid' | 'date' | 'number' | 'enum' | 'boolean';

export interface FilterFieldDescriptor {
  key: string;
  label: string;
  kind: FilterFieldKind;
  required: boolean;
  /** Only set for `enum`/`boolean` kinds. */
  options?: string[];
  min?: number;
  max?: number;
}

function fieldKind(prop: JsonSchemaProperty): FilterFieldKind {
  if (prop.enum && prop.enum.length > 0) return 'enum';
  if (prop.type === 'boolean') return 'boolean';
  if (prop.type === 'integer' || prop.type === 'number') return 'number';
  if (prop.type === 'string' && prop.format === 'date') return 'date';
  if (prop.type === 'string' && prop.format === 'uuid') return 'uuid';
  return 'text';
}

export function deriveFilterFields(schema: JsonSchemaObject | undefined): FilterFieldDescriptor[] {
  if (!schema?.properties) return [];
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([key, prop]) => ({
    key,
    label: humanizeKey(key),
    kind: fieldKind(prop),
    required: required.has(key),
    options: prop.enum,
    min: prop.minimum ?? prop.exclusiveMinimum,
    max: prop.maximum,
  }));
}

/**
 * String-keyed form state (every input, including number/boolean, is edited
 * as a string — plain HTML input values) -> the typed filters object the
 * backend expects. Empty/untouched optional fields are omitted entirely
 * rather than sent as `""` — the backend's zod schema uses `.optional()`,
 * not `.optional().nullable()` with `""` accepted, so e.g. an empty
 * `carrierId` would fail the `.uuid()` check if sent at all.
 */
export function buildFiltersPayload(
  fields: FilterFieldDescriptor[],
  values: Record<string, string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (raw === undefined || raw === '') continue;
    if (field.kind === 'number') {
      const n = Number(raw);
      if (Number.isFinite(n)) payload[field.key] = n;
    } else if (field.kind === 'boolean') {
      payload[field.key] = raw === 'true';
    } else {
      payload[field.key] = raw;
    }
  }
  return payload;
}
