import { requirePortalSession } from '@/lib/portal-auth/session';
import { PortalCasesView } from './cases-view';

export const metadata = {
  title: 'Support — Customer Portal',
};

export default async function PortalCasesPage() {
  await requirePortalSession();
  return <PortalCasesView />;
}
