import { requirePortalSession } from '@/lib/portal-auth/session';
import { PortalPoliciesView } from './policies-view';

export const metadata = {
  title: 'Policies — Customer Portal',
};

export default async function PortalPoliciesPage() {
  await requirePortalSession();
  return <PortalPoliciesView />;
}
