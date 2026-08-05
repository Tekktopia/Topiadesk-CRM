import { AutomationRulesListView } from '../_components/automation-rules-list-view';

export const metadata = {
  title: 'Automations',
};

/** Zendesk's "Automations": time-based rules that fire on a scheduled scan
 * rather than a live event (AutomationRule.triggerType === 'SCHEDULE'). See
 * .../triggers for the real-time counterpart, and
 * automation-rules-list-view.tsx for the shared component both pages
 * render. No scheduled scan job consumes SCHEDULE rules yet in this build —
 * automation-rules.controller.ts is CRUD only — so entries created here are
 * recorded but not yet actively evaluated. */
export default function AutomationsPage() {
  return (
    <AutomationRulesListView
      triggerType="SCHEDULE"
      title="Automations"
      description="Time-based rules that run on a scheduled scan rather than a live event. Not yet wired to a scan job in this build — entries are recorded but not yet actively evaluated."
      emptyTitle="No automations yet"
      emptyDescription="Create one to define a scheduled rule ready for a future scan job to evaluate."
      newLabel="New automation"
    />
  );
}
