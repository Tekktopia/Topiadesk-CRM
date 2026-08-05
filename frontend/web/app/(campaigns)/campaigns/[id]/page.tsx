import { CampaignDetailView } from './_components/campaign-detail-view';

export const metadata = {
  title: 'Campaign',
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignDetailView campaignId={id} />;
}
