import { TriggerBuilderView } from '../../_components/trigger-builder-view';

export const metadata = {
  title: 'Edit Trigger',
};

export default async function EditTriggerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TriggerBuilderView ruleId={id} />;
}
