import { ReportRunnerView } from './report-runner-view';

export const metadata = {
  title: 'Run report',
};

export default async function ReportRunnerPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <ReportRunnerView reportKey={key} />;
}
