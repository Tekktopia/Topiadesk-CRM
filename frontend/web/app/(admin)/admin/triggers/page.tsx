import { TriggersListView } from '../_components/triggers-list-view';
import { WorkflowSurfaceGuide } from '../_components/workflow-surface-guide';

export const metadata = {
  title: 'Triggers',
};

/** Zendesk's "Triggers": real-time rules that fire immediately on a record
 * event (AutomationRule.triggerType === 'ENTITY_EVENT'), scoped to the
 * Renewal Playbooks domain — see triggers-list-view.tsx and
 * trigger-builder-view.tsx (the structured when/then builder new/[id] route
 * to). See .../workflows for the Ticket/Claim half of the same underlying
 * ENTITY_EVENT table, and .../automations for the time-based counterpart. */
export default function TriggersPage() {
  return (
    <div className="space-y-4">
      <WorkflowSurfaceGuide current="triggers" />
      <TriggersListView />
    </div>
  );
}
