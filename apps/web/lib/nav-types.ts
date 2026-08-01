import type { LucideIcon } from 'lucide-react';

/**
 * Shared shape for every route group's `nav.ts` export. See
 * `app/(dashboard)/nav.ts` for the worked example and
 * `app/layout.tsx` for the aggregation pattern Batch 2 route groups
 * (`(crm)`, `(policy)`, `(admin)`) should follow: add one `nav.ts` file
 * per group, then add one import + one spread entry in the root layout's
 * `nav` array. Nothing else in the routing/shell needs to change.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Route groups sharing a section heading in the sidebar, e.g. "CRM",
   * "Policy", "Admin". Omit for top-level items like the dashboard home. */
  section?: string;
}
