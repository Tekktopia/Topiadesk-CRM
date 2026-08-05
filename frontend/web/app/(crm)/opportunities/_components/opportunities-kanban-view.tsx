'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@topiadesk/ui';
import { BulkActionToolbar } from '../../_components/bulk-action-toolbar';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { SavedViewBar } from '../../_components/saved-view-bar';
import { formatCurrency } from '../../_lib/format';
import {
  useAccountsLookup,
  useBulkAssignOpportunities,
  useBulkDeleteOpportunities,
  usePipeline,
  usePipelines,
  useOpportunities,
  useUpdateOpportunityStage,
} from '../../_lib/hooks';
import type { FilterTree, Opportunity } from '../../_lib/types';
import { OpportunityCard } from './opportunity-card';
import { OpportunityFormDialog } from './opportunity-form-dialog';

export function OpportunitiesKanbanView() {
  const searchParams = useSearchParams();
  const accountIdFilter = searchParams.get('accountId') ?? undefined;

  const { data: pipelines, isLoading: pipelinesLoading } = usePipelines();
  const [pipelineId, setPipelineId] = React.useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [movingId, setMovingId] = React.useState<string | null>(null);
  // Non-null while a saved view is applied — its rows replace the live query
  // on the board (still bucketed by stage). See accounts-list-view.tsx.
  const [savedViewRows, setSavedViewRows] = React.useState<Opportunity[] | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!pipelineId && pipelines && pipelines.length > 0) {
      setPipelineId(pipelines[0]!.id);
    }
  }, [pipelines, pipelineId]);

  const { data: pipelineDetail, isLoading: stagesLoading } = usePipeline(pipelineId);
  const { data: liveOpportunities, isLoading: oppsLoading } = useOpportunities({
    pipelineId,
    accountId: accountIdFilter,
  });
  const opportunities = savedViewRows ?? liveOpportunities;
  const { accountsById } = useAccountsLookup();
  const updateStage = useUpdateOpportunityStage();
  const bulkAssign = useBulkAssignOpportunities();
  const bulkDelete = useBulkDeleteOpportunities();

  const isLoading = pipelinesLoading || stagesLoading || oppsLoading || !pipelineId;

  const stages = (pipelineDetail?.stages ?? []).slice().sort((a, b) => a.order - b.order);
  const byStage = new Map<string, Opportunity[]>();
  for (const stage of stages) byStage.set(stage.id, []);
  for (const opp of opportunities ?? []) {
    const bucket = byStage.get(opp.pipelineStageId);
    if (bucket) bucket.push(opp);
    else byStage.set(opp.pipelineStageId, [opp]);
  }

  // The board's own controls only cover accountId — that's the one live
  // filter this view exposes that saved-view-filters.ts's OPPORTUNITY
  // allowlist also accepts (pipelineId filters via the pipelineStage
  // relation, which isn't a filterable column there).
  function buildFilters(): FilterTree {
    const conditions: FilterTree['conditions'] = [];
    if (accountIdFilter) conditions.push({ field: 'accountId', operator: 'eq', value: accountIdFilter });
    return { op: 'AND', conditions };
  }

  function handleMoveStage(opportunityId: string, targetStageId: string) {
    setMovingId(opportunityId);
    updateStage.mutate(
      { id: opportunityId, input: { pipelineStageId: targetStageId } },
      { onSettled: () => setMovingId(null) },
    );
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Opportunities grouped by stage — move a deal forward as it progresses."
        actions={
          <>
            <Select value={pipelineId} onValueChange={setPipelineId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select pipeline" />
              </SelectTrigger>
              <SelectContent>
                {(pipelines ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New opportunity
            </Button>
          </>
        }
      />

      <SavedViewBar<Opportunity> entityType="OPPORTUNITY" buildFilters={buildFilters} onApply={setSavedViewRows} />

      {accountIdFilter ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered to account:</span>
          <Badge variant="secondary">{accountsById.get(accountIdFilter)?.name ?? accountIdFilter}</Badge>
          <Link href="/opportunities" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" aria-hidden /> Clear
          </Link>
        </div>
      ) : null}

      <BulkActionToolbar
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        reassignLabel="Reassign owner"
        onReassign={(ownerId) =>
          bulkAssign.mutate({ ids: [...selectedIds], ownerId }, { onSuccess: () => setSelectedIds(new Set()) })
        }
        isReassigning={bulkAssign.isPending}
        onDelete={() => bulkDelete.mutate({ ids: [...selectedIds] }, { onSuccess: () => setSelectedIds(new Set()) })}
        isDeleting={bulkDelete.isPending}
        entityNamePlural="opportunities"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-full" />
          ))}
        </div>
      ) : stages.length === 0 ? (
        <EmptyState title="This pipeline has no stages configured" />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const items = byStage.get(stage.id) ?? [];
            const total = items.reduce((sum, o) => sum + Number.parseFloat(o.amount || '0'), 0);
            return (
              <div key={stage.id} className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30">
                <div className="border-b border-border p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{stage.name}</h3>
                    <Badge variant={stage.isWon ? 'success' : stage.isLost ? 'destructive' : 'outline'}>{items.length}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(total)}</p>
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {items.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">No opportunities in this stage.</p>
                  ) : (
                    items.map((opp) => (
                      <OpportunityCard
                        key={opp.id}
                        opportunity={opp}
                        accountName={accountsById.get(opp.accountId)?.name}
                        stages={stages}
                        onMoveStage={(stageId) => handleMoveStage(opp.id, stageId)}
                        isMoving={movingId === opp.id}
                        selected={selectedIds.has(opp.id)}
                        onSelectChange={(checked) => toggleSelected(opp.id, checked)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <OpportunityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultPipelineStageId={stages[0]?.id}
      />
    </div>
  );
}
