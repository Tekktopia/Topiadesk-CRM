import { requirePortalSession } from '@/lib/portal-auth/session';
import { PortalPolicyDetailView } from './policy-detail-view';

export const metadata = {
  title: 'Policy — Customer Portal',
};

export default async function PortalPolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalSession();
  const { id } = await params;
  return <PortalPolicyDetailView policyId={id} />;
}
