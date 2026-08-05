import { AutomationRulesListView } from '../_components/automation-rules-list-view';

export const metadata = {
  title: 'Triggers',
};

/** Zendesk's "Triggers": real-time rules that fire immediately on a record
 * event (AutomationRule.triggerType === 'ENTITY_EVENT'). See .../automations
 * for the time-based counterpart, and automation-rules-list-view.tsx for
 * the shared component both pages render. */
export default function TriggersPage() {
  return (
    <AutomationRulesListView
      triggerType="ENTITY_EVENT"
      title="Triggers"
      description="Real-time rules that fire immediately when a record event occurs — currently evaluated by the Renewal Playbooks worker job when a policy renewal crosses an alert threshold."
      emptyTitle="No triggers yet"
      emptyDescription="Create one to react to record events in real time, e.g. a renewal crossing a 30/60/90-day alert threshold."
      newLabel="New trigger"
    />
  );
}
