'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, XCircle } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type { AutomationExecutionLogDto } from '../_lib/types';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusVariant(status: AutomationExecutionLogDto['status']): BadgeVariant {
  if (status === 'SUCCESS') return 'success';
  if (status === 'PARTIAL_FAILURE') return 'warning';
  return 'destructive';
}
function statusIcon(status: AutomationExecutionLogDto['status']) {
  if (status === 'SUCCESS') return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />;
  if (status === 'PARTIAL_FAILURE') return <CircleAlert className="h-3.5 w-3.5" aria-hidden />;
  return <XCircle className="h-3.5 w-3.5" aria-hidden />;
}

/**
 * Execution history for a rule's flat `actions` path — the "simple/flat
 * trigger" counterpart to AutomationRunState's own history (branching
 * `steps` runs, which have no equivalent UI here since that's a separate
 * concern — see automation-run-states.controller.ts). Previously this
 * rule's every firing computed a per-action result list and discarded it
 * behind a one-line console.log; nothing distinguished an automated change
 * from a human edit after the fact (see business-rules-list-view.tsx's own
 * delete-confirm copy acknowledging exactly this gap for the sibling
 * BusinessRule system). Only rendered for an existing rule (ruleId set) —
 * a rule that's never fired the flat path (e.g. always used `steps`, or
 * simply hasn't matched anything yet) just shows the empty state below.
 */
export function WorkflowExecutionLogPanel({ ruleId }: { ruleId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'automation-rules', ruleId, 'execution-log'],
    queryFn: () => apiFetch<AutomationExecutionLogDto[]>(`/api/crm/automation-rules/${ruleId}/execution-log`),
    staleTime: 15_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : isError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load execution history.</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No firings recorded yet. This fills in once the rule matches a live event and runs its actions — if the rule uses steps
            (branching) instead of a flat action list, look at its run history under Approvals/automation run states instead.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {data.map((log) => (
              <li key={log.id} className="rounded-md border border-border p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant={statusVariant(log.status)} className="gap-1">
                    {statusIcon(log.status)}
                    {log.status === 'PARTIAL_FAILURE' ? 'Partial failure' : log.status === 'SUCCESS' ? 'Success' : 'Failed'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {log.entityType}
                  {log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ''} · via {log.triggerSource === 'RENEWAL_PLAYBOOK' ? 'renewal playbook' : 'entity event'}
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {log.actionResults.map((r, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs">
                      {r.ok ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-success" aria-hidden />
                      ) : (
                        <XCircle className="h-3 w-3 shrink-0 text-destructive" aria-hidden />
                      )}
                      <span className={r.ok ? 'text-foreground' : 'text-destructive'}>
                        {r.actionType}
                        {r.error ? ` — ${r.error}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
