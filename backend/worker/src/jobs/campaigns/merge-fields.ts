/**
 * Send-time merge field RESOLVER — the counterpart to
 * backend/api/src/modules/campaigns/merge-fields.ts's descriptor list
 * (which just surfaces the same key set for template authors via
 * GET /campaign-templates/merge-fields). Both files must expose the same
 * key set — kept in sync by hand, same api/worker-duplication reasoning as
 * segment-filters.ts.
 *
 * Resolution is entirely against this hardcoded entity->field map — never
 * `eval`'d, never a dynamic/arbitrary path lookup off the contact object.
 * `{{contact.firstName}}`-style tokens in a template body are substituted
 * only if the key appears in the `values` map this function builds; an
 * unrecognized token is left untouched in the output (visible, harmless,
 * easier to debug than silently blanking it).
 */
export interface ContactForMergeFields {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  account: {
    name: string;
    accountType: string;
    policies: Array<{
      policyNumber: string;
      lineOfBusiness: string;
      expiryDate: Date;
      sumInsured: unknown;
      renewalSchedule: { renewalDueDate: Date } | null;
    }>;
  } | null;
}

/** "Most relevant policy" = the account's soonest-expiring policy — callers query with `orderBy: { expiryDate: 'asc' }, take: 1` on the included relation, so `policies[0]` here is already that row. */
export function resolveMergeFields(contact: ContactForMergeFields): Record<string, string> {
  const policy = contact.account?.policies[0];
  const formatDate = (d: Date | undefined | null): string => (d ? d.toISOString().slice(0, 10) : '');
  const formatMoney = (v: unknown): string => (v == null ? '' : Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  return {
    'contact.firstName': contact.firstName,
    'contact.lastName': contact.lastName,
    'contact.fullName': `${contact.firstName} ${contact.lastName}`.trim(),
    'contact.email': contact.email ?? '',
    'contact.phone': contact.phone ?? '',
    'account.name': contact.account?.name ?? '',
    'account.accountType': contact.account?.accountType ?? '',
    'policy.policyNumber': policy?.policyNumber ?? '',
    'policy.lineOfBusiness': policy?.lineOfBusiness ?? '',
    'policy.expiryDate': formatDate(policy?.expiryDate),
    'policy.renewalDueDate': formatDate(policy?.renewalSchedule?.renewalDueDate),
    'policy.sumInsured': formatMoney(policy?.sumInsured),
  };
}

const MERGE_FIELD_TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function substituteMergeFields(template: string, values: Record<string, string>): string {
  return template.replace(MERGE_FIELD_TOKEN, (match, key: string) => (key in values ? values[key]! : match));
}
