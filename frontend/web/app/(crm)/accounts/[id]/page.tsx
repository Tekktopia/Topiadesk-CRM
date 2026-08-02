import { AccountDetailView } from './_components/account-detail-view';

export const metadata = {
  title: 'Account',
};

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AccountDetailView accountId={id} />;
}
