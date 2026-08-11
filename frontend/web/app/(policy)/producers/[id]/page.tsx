import { ProducerDetailView } from './producer-detail-view';

export const metadata = {
  title: 'Producer',
};

export default async function ProducerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProducerDetailView producerId={id} />;
}
