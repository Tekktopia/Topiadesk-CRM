import { ReportsCatalogView } from './reports-catalog-view';

export const metadata = {
  title: 'Reports',
};

/**
 * Server Component shell (so it can export `metadata`) — all data fetching
 * lives in the Client Component below it, via TanStack Query against the
 * same-origin app/api/reports proxy (see lib/api/server-fetch.ts's header
 * comment for why Client Components can't reach backend/api directly).
 */
export default function ReportsPage() {
  return <ReportsCatalogView />;
}
