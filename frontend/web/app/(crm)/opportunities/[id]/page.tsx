import { OpportunityDetailView } from './_components/opportunity-detail-view';

export const metadata = {
  title: 'Opportunity',
};

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OpportunityDetailView opportunityId={id} />;
}
