import { PolicyDetailView } from './policy-detail-view';

export const metadata = {
  title: 'Policy detail',
};

export default async function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PolicyDetailView policyId={id} />;
}
