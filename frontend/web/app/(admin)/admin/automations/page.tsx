import { AutomationRulesListView } from '../_components/automation-rules-list-view';
import { WorkflowSurfaceGuide } from '../_components/workflow-surface-guide';

export const metadata = {
  title: 'Automations',
};

/**
 * Zendesk's "Automations": time-based rules (AutomationRule.triggerType ===
 * 'SCHEDULE'). See .../triggers for the real-time counterpart, and
 * automation-rules-list-view.tsx for the shared component both render.
 *
 * These now actually run. Until the scheduled scan job existed
 * (backend/worker/src/jobs/automation-schedule/schedule-scan.job.ts) this
 * page's own description told users their rules were "recorded but not yet
 * actively evaluated" — it created rules that could never fire, which is
 * worse than not offering the feature at all.
 */
export default function AutomationsPage() {
  return (
    <div className="space-y-4">
      <WorkflowSurfaceGuide current="automations" />
      <AutomationRulesListView
        triggerType="SCHEDULE"
        title="Automations"
        description="Rules that run on a schedule — chase renewals, escalate ageing tickets, follow up on unpaid premiums. Each run finds every matching record and acts on it."
        emptyTitle="No automations yet"
        emptyDescription="Create one to run a rule on a schedule — for example, task the producer thirty days before every policy expires."
        newLabel="New automation"
      />
    </div>
  );
}
