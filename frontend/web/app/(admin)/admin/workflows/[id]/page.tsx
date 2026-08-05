import { WorkflowBuilderView } from '../../_components/workflow-builder-view';

export const metadata = {
  title: 'Edit Workflow',
};

export default async function EditWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkflowBuilderView ruleId={id} />;
}
