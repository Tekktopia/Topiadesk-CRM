import Link from 'next/link';
import { Clock, GitBranch, Zap } from 'lucide-react';

/**
 * Which of the three Workflow pages an admin actually wants.
 *
 * Automations, Triggers and Workflows are three admin pages over one
 * underlying AutomationRule table, split by trigger type and by how
 * elaborate the rule is. Each is defensible on its own, but together they
 * gave an admin no way to know where to go: "make the system do something
 * when X happens" is a sentence that fits all three page titles.
 *
 * Deliberately a signpost rather than a merger. Each surface has a real
 * builder behind it — Triggers has the renewal-playbook builder, Workflows
 * has the multi-step branching and approval-gate engine — and collapsing
 * them into one page would mean rebuilding or discarding working
 * functionality to solve what is a naming problem.
 */
export function WorkflowSurfaceGuide({ current }: { current: 'workflows' | 'triggers' | 'automations' }) {
  const surfaces = [
    {
      key: 'automations' as const,
      href: '/admin/automations',
      icon: Clock,
      label: 'Automations',
      when: 'on a schedule — every hour, nightly, weekdays at 8',
    },
    {
      key: 'triggers' as const,
      href: '/admin/triggers',
      icon: Zap,
      label: 'Triggers',
      when: 'the moment a record changes',
    },
    {
      key: 'workflows' as const,
      href: '/admin/workflows',
      icon: GitBranch,
      label: 'Workflows',
      when: 'a multi-step sequence with branches or approvals',
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
      <span className="font-medium text-foreground">Run something…</span>
      {surfaces.map((surface) => {
        const Icon = surface.icon;
        const isCurrent = surface.key === current;
        const content = (
          <span className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className={isCurrent ? 'font-semibold text-foreground' : ''}>{surface.when}</span>
          </span>
        );
        return isCurrent ? (
          <span key={surface.key} className="text-foreground" aria-current="page">
            {content}
          </span>
        ) : (
          <Link key={surface.key} href={surface.href} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {content}
          </Link>
        );
      })}
    </div>
  );
}
