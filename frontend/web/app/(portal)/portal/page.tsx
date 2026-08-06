import { requirePortalSession } from '@/lib/portal-auth/session';
import { PortalDashboardView } from './dashboard-view';

export const metadata = {
  title: 'Overview — Customer Portal',
};

export default async function PortalDashboardPage() {
  await requirePortalSession();
  return <PortalDashboardView />;
}
