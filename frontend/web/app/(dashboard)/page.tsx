import { DashboardView } from './dashboard-view';

export const metadata = {
  title: 'Dashboard',
};

/**
 * Real operational home dashboard — replaces the Phase-0 static placeholder
 * (hardcoded KPI numbers, see this file's git history / the comment it
 * used to carry) with live data: GET /dashboards/operational-kpis for the
 * StatTile row, a composed pipeline-funnel aggregation for the CRM
 * pipeline chart, and a composed renewal-schedule listing for the renewal
 * timeline (see app/api/dashboard/*'s route handlers for how each is
 * sourced — there is no single backend endpoint for the latter two).
 *
 * This file stays a Server Component (so it can export `metadata`); all
 * data fetching/interactivity lives in the Client Component below it, via
 * TanStack Query against the same-origin app/api/dashboard/* proxies —
 * Client Components can't reach backend/api directly (see
 * lib/api/server-fetch.ts's header comment).
 */
export default function DashboardPage() {
  return <DashboardView />;
}
