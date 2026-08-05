/** Formatting helpers shared across app/(campaigns)/** views. Mirrors app/(crm)/_lib/format.ts's date helpers (kept in sync by hand, same convention). */

const dateFormatter = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

/** Backend rates are 0-1 fractions (see CampaignPerformanceResponseDto) — renders as e.g. "12.3%". */
export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Client-side-only convenience preview: substitutes `{{key}}` placeholders
 * with each merge field's sample `example` value (from GET
 * /campaign-templates/merge-fields). There is no backend template-render
 * preview endpoint (CampaignTemplatesController only exposes
 * list/get/create/update/delete/merge-fields — see that controller) — real
 * substitution against a live contact only happens at send time, in
 * backend/worker/src/jobs/campaigns/merge-fields.ts. This is purely a
 * "what would this roughly look like" aid, not a source of truth.
 */
export function substituteMergeFieldsPreview(template: string, mergeFields: readonly { key: string; example: string }[]): string {
  return mergeFields.reduce((acc, f) => acc.split(`{{${f.key}}}`).join(f.example), template);
}

/** All `{{some.key}}` placeholders actually used in a template's text, filtered to the known merge-field allowlist — used to derive CampaignTemplate.mergeFields from usage instead of a separate manual picker. */
export function extractUsedMergeFieldKeys(text: string, knownKeys: readonly string[]): string[] {
  const known = new Set(knownKeys);
  const found = new Set<string>();
  const pattern = /\{\{\s*([\w.]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[1]!;
    if (known.has(key)) found.add(key);
  }
  return Array.from(found);
}
