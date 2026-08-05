import { ClaimDetailView } from './_components/claim-detail-view';

export const metadata = {
  title: 'Claim',
};

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClaimDetailView claimId={id} />;
}
