'use client';

import { useMemo } from 'react';
import { ArrowDown, CircleSlash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@topiadesk/ui';
import { STEP_KIND_META, type BuilderStep } from './workflow-builder-view';

interface UserLike {
  id: string;
  fullName: string;
}
interface TeamLike {
  id: string;
  name: string;
}

/**
 * Pure presentational live preview of the workflow being built — fills the
 * previously-empty right-hand column in the builder (the customer's own
 * complaint: "there are still spaces at the right... that space should be
 * showing the process"). A linear annotated list, not a 2D graph canvas —
 * deliberately simple, no new dependency; branching (CONDITION/
 * APPROVAL_GATE routing) is shown as caption lines naming the target step
 * number rather than drawn as wires.
 */
export function WorkflowPreviewPanel({
  entityType,
  eventTypes,
  steps,
  users,
  teams,
}: {
  entityType: 'CASE' | 'CLAIM';
  eventTypes: string[];
  steps: BuilderStep[];
  users: UserLike[];
  teams: TeamLike[];
}) {
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u.fullName])), [users]);
  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const stepNumberById = useMemo(() => new Map(steps.map((s, i) => [s.id, i + 1])), [steps]);

  function personName(id: string | undefined): string {
    if (!id) return 'someone';
    return usersById.get(id) ?? 'a removed user';
  }
  function teamName(id: string | undefined): string {
    if (!id) return '';
    return teamsById.get(id) ?? 'a removed team';
  }
  function gotoLabel(id: string | undefined): string {
    if (!id) return '';
    const n = stepNumberById.get(id);
    return n ? `step ${n}` : 'an unknown step';
  }

  function summarize(step: BuilderStep): string {
    switch (step.kind) {
      case 'ASSIGN_USER':
        return `Assign to ${personName(step.userId)}`;
      case 'ASSIGN_TEAM':
        return `Assign to ${teamName(step.teamId) || 'a team'}`;
      case 'SET_STATUS':
        return step.status ? `Set status to ${step.status}` : 'Set status';
      case 'SET_PRIORITY':
        return step.priority ? `Set priority to ${step.priority}` : 'Set priority';
      case 'ADD_NOTE':
        return step.noteSubject || 'Add an internal note';
      case 'NOTIFY_PERSON':
        return `Notify ${personName(step.userId)} (${step.notifyChannel === 'EMAIL' ? 'email' : 'in-app'})`;
      case 'NOTIFY_GROUP':
        return `Notify ${teamName(step.teamId) || 'a team'} (${step.notifyChannel === 'EMAIL' ? 'email' : 'in-app'})`;
      case 'APPROVAL': {
        const named = (step.approverUserIds ?? []).map((id) => personName(id));
        const required = step.requiredApprovals ?? 1;
        if (named.length > 0) return `Requires ${required > 1 ? `${required} of` : ''} ${named.join(', ')}`.trim();
        if (step.approvalNotifyTeamId) return `Requires approval from ${teamName(step.approvalNotifyTeamId)}`;
        return 'Requires approval';
      }
      case 'CONDITION':
        return step.conditionField ? `If ${step.conditionField} ${step.conditionOperator === 'NOT_EQUALS' ? '≠' : '='} ${step.conditionValue || '…'}` : 'If…';
      case 'SEND_EMAIL': {
        const who =
          step.emailRecipientMode === 'CASE_CUSTOMER' ? "the ticket's customer" : step.emailRecipientMode === 'TEAM' ? teamName(step.emailRecipientTeamId) || 'a team' : personName(step.emailRecipientUserId);
        return `Email ${who}${step.emailSubject ? ` — "${step.emailSubject}"` : ''}`;
      }
      case 'NOTIFY_TEAMS':
        return `Post to Teams${step.teamsTitle ? ` — "${step.teamsTitle}"` : ''}`;
      default:
        return '';
    }
  }

  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle className="text-sm">Process preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{entityType === 'CLAIM' ? 'Claim' : 'Ticket'}</span>
          {eventTypes.length > 0 ? ` — ${eventTypes.join(', ')}` : ' — no trigger selected yet'}
        </div>

        {steps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            <CircleSlash2 className="h-5 w-5" aria-hidden />
            Add steps below to see the process here.
          </div>
        ) : (
          <ol className="space-y-0">
            {steps.map((step, index) => {
              const meta = STEP_KIND_META[step.kind];
              const Icon = meta.icon;
              const isLast = index === steps.length - 1;
              return (
                <li key={step.id}>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
                      <Icon className="h-3.5 w-3.5 text-secondary-foreground" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="text-xs font-medium text-foreground">
                        {index + 1}. {meta.label}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{summarize(step)}</p>
                      {step.kind === 'CONDITION' ? (
                        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                          <div>✓ True → {gotoLabel(step.conditionOnTrueGoto) || 'ends the workflow'}</div>
                          <div>✗ False → {gotoLabel(step.conditionOnFalseGoto) || 'ends the workflow'}</div>
                        </div>
                      ) : null}
                      {step.kind === 'APPROVAL' && (step.onApproveGoto || step.onRejectGoto) ? (
                        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                          {step.onApproveGoto ? <div>On approve → {gotoLabel(step.onApproveGoto)}</div> : null}
                          {step.onRejectGoto ? <div>On reject → {gotoLabel(step.onRejectGoto)}</div> : <div>On reject → ends the workflow</div>}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {!isLast ? <ArrowDown className="ml-2.5 h-3.5 w-3.5 text-muted-foreground/50" aria-hidden /> : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
