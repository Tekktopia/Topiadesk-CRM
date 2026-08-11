import { requirePortalSession } from '@/lib/portal-auth/session';
import { PortalKnowledgeView } from './knowledge-view';

export const metadata = {
  title: 'Help Center — Customer Portal',
};

export default async function PortalKnowledgePage() {
  await requirePortalSession();
  return <PortalKnowledgeView />;
}
