/**
 * Fixed, hardcoded allow-list of merge fields a CampaignTemplate body may
 * reference (`{{contact.firstName}}` placeholder syntax). This is the
 * descriptor list surfaced by GET /campaign-templates/merge-fields for
 * template authors — actual VALUE resolution at send time happens in
 * backend/worker/src/jobs/campaigns/merge-fields.ts against a hardcoded
 * entity->field map, never `eval`'d or resolved from an arbitrary path.
 * Both files must expose the same set of keys — kept in sync by hand, same
 * reasoning as segment-filters.ts (api/worker are independently deployable
 * apps with no shared package for this).
 */
export interface MergeFieldDescriptor {
  key: string;
  label: string;
  example: string;
}

export const CAMPAIGN_MERGE_FIELDS: readonly MergeFieldDescriptor[] = [
  { key: 'contact.firstName', label: 'Contact first name', example: 'Tunde' },
  { key: 'contact.lastName', label: 'Contact last name', example: 'Bakare' },
  { key: 'contact.fullName', label: 'Contact full name', example: 'Tunde Bakare' },
  { key: 'contact.email', label: 'Contact email', example: 'tunde@example.com' },
  { key: 'contact.phone', label: 'Contact phone', example: '+2348012345678' },
  { key: 'account.name', label: 'Account / company name', example: 'Adeyemi Logistics' },
  { key: 'account.accountType', label: 'Account type', example: 'CORPORATE' },
  { key: 'policy.policyNumber', label: 'Most relevant policy number', example: 'POL-2026-00042' },
  { key: 'policy.lineOfBusiness', label: 'Most relevant policy line of business', example: 'MOTOR' },
  { key: 'policy.expiryDate', label: 'Most relevant policy expiry date', example: '2026-10-15' },
  { key: 'policy.renewalDueDate', label: 'Most relevant policy renewal due date', example: '2026-10-15' },
  { key: 'policy.sumInsured', label: 'Most relevant policy sum insured', example: '5,000,000.00' },
] as const;

export const CAMPAIGN_MERGE_FIELD_KEYS: readonly string[] = CAMPAIGN_MERGE_FIELDS.map((f) => f.key);
