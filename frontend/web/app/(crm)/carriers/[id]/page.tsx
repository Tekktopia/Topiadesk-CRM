import { CarrierDetailView } from './_components/carrier-detail-view';

export const metadata = {
  title: 'Carrier',
};

export default async function CarrierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CarrierDetailView carrierId={id} />;
}
