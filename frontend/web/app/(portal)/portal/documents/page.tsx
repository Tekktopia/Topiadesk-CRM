import { requirePortalSession } from '@/lib/portal-auth/session';
import { PortalDocumentsView } from './documents-view';

export const metadata = {
  title: 'Documents — Customer Portal',
};

export default async function PortalDocumentsPage() {
  await requirePortalSession();
  return <PortalDocumentsView />;
}
