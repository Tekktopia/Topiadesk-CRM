import { SurveyDetailView } from './survey-detail-view';

export const metadata = {
  title: 'Survey',
};

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SurveyDetailView surveyId={id} />;
}
