import { requirePortalSession } from '@/lib/portal-auth/session';
import { PortalCaseDetailView } from './case-detail-view';

export const metadata = {
  title: 'Support request — Customer Portal',
};

export default async function PortalCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalSession();
  const { id } = await params;
  return <PortalCaseDetailView caseId={id} />;
}
