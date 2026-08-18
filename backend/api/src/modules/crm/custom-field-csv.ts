import { stringify } from 'csv-stringify/sync';
import { type CustomFieldDefinition } from '@topiadesk/db';

/**
 * Export-only, matching the other CRM exporters.
 *
 * This one doubles as a schema document — a tenant handing their custom-field
 * layout to an integrator or an auditor exports this rather than screenshotting
 * the admin page. `options` is joined with ';' rather than ',' so a SELECT's
 * choices survive a CSV round-trip without the whole field needing quoting,
 * the same convention account-csv.ts uses for tags.
 *
 * `isActive` is included, not filtered on: a deactivated definition still
 * explains jsonb values sitting on live rows (soft-delete, see the
 * controller's header comment), so omitting it would make the export
 * misleading rather than tidier.
 */
const EXPORT_COLUMNS = [
  'entityType',
  'key',
  'label',
  'fieldType',
  'options',
  'isRequired',
  'isActive',
  'displayOrder',
  'helpText',
  'createdAt',
] as const;

export function customFieldDefinitionsToCsv(definitions: CustomFieldDefinition[]): string {
  const rows = definitions.map((d) => ({
    entityType: d.entityType,
    key: d.key,
    label: d.label,
    fieldType: d.fieldType,
    options: Array.isArray(d.options) ? (d.options as unknown[]).join(';') : '',
    isRequired: d.isRequired ? 'true' : 'false',
    isActive: d.isActive ? 'true' : 'false',
    displayOrder: String(d.displayOrder),
    helpText: d.helpText ?? '',
    createdAt: d.createdAt.toISOString(),
  }));
  return stringify(rows, { header: true, columns: EXPORT_COLUMNS as unknown as string[] });
}
