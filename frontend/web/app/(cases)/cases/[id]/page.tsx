import { CaseDetailView } from './_components/case-detail-view';

export const metadata = {
  title: 'Case',
};

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetailView caseId={id} />;
}
