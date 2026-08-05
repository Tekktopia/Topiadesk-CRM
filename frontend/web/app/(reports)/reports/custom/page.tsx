import { CustomReportBuilderView } from './custom-report-builder-view';

export const metadata = {
  title: 'Custom Reports',
};

/**
 * Server Component shell (so it can export `metadata`) — all data fetching
 * lives in the Client Component below it. See custom-report-field-registry.ts
 * on the backend for the injection-safety design this builder depends on:
 * every entity/field this page lets a user pick is drawn from that
 * hardcoded allow-list, never freehand.
 */
export default function CustomReportsPage() {
  return <CustomReportBuilderView />;
}
