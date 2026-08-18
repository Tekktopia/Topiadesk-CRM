'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Download, Plus, Search, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
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
  useDirectoryUsers,
  usePipeline,
  usePipelines,
  useOpportunities,
  useOpportunitiesCount,
  useOpportunityStats,
  useUpdateOpportunityStage,
} from '../../_lib/hooks';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import type { FilterTree, Opportunity, OpportunityQuery } from '../../_lib/types';
import { OpportunityCard } from './opportunity-card';
import { OpportunityFormDialog } from './opportunity-form-dialog';
import { OpportunitiesTableView } from './opportunities-table-view';
import { PipelineStatsStrip } from './pipeline-stats-strip';

const UNSET = '__any';
const FETCH_CAP = 200;

/**
 * Coarse size bands rather than two free-text amount inputs — one control,
 * and it sidesteps asking the user to type an unformatted figure. Bounds are
 * compared against the deal's OWN currency (the filter is a plain WHERE on
 * Opportunity.amount, no conversion), which is why the labels stay
 * currency-agnostic instead of implying a specific symbol.
 */
const DEAL_SIZE_BANDS = [
  { value: 'small', label: 'Under 1M', minAmount: undefined, maxAmount: 1_000_000 },
  { value: 'mid', label: '1M – 10M', minAmount: 1_000_000, maxAmount: 10_000_000 },
  { value: 'large', label: 'Over 10M', minAmount: 10_000_000, maxAmount: undefined },
] as const;

export function OpportunitiesKanbanView() {
  const searchParams = useSearchParams();
  const accountIdFilter = searchParams.get('accountId') ?? undefined;
  // Dashboard drill-down entry points: the pipeline-funnel chart links here
  // with pipelineId+stageId (a specific stage bar), the KPI tiles link with
  // isOpen=true (open-opportunities/pipeline-value tiles). Read once as
  // initial values, same pattern as accountIdFilter above.
  const stageIdFilter = searchParams.get('stageId') ?? undefined;
  // Kept as the literal string 'true' (or omitted) rather than a boolean:
  // the API models boolean query flags as strings because the global
  // ValidationPipe's enableImplicitConversion casts a boolean-typed param
  // with Boolean(), which turns the string "false" into `true`. See
  // AccountQueryDto.includeArchived for the full explanation.
  const isOpenFilter = searchParams.get('isOpen') === 'true' ? 'true' : undefined;
  const urlPipelineId = searchParams.get('pipelineId') ?? undefined;
  const ownerIdFilter = searchParams.get('ownerId') ?? undefined;

  const { data: pipelines, isLoading: pipelinesLoading } = usePipelines();
  const [pipelineId, setPipelineId] = React.useState<string | undefined>(urlPipelineId);
  const [viewMode, setViewMode] = React.useState<'kanban' | 'table'>('kanban');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [movingId, setMovingId] = React.useState<string | null>(null);
  // Non-null while a saved view is applied — its rows replace the live query
  // on the board (still bucketed by stage). See accounts-list-view.tsx.
  const [savedViewRows, setSavedViewRows] = React.useState<Opportunity[] | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState('');
  const [owner, setOwner] = React.useState<string>(UNSET);
  const [sizeBand, setSizeBand] = React.useState<string>(UNSET);

  React.useEffect(() => {
    if (!pipelineId && pipelines && pipelines.length > 0) {
      setPipelineId(pipelines[0]!.id);
    }
  }, [pipelines, pipelineId]);

  const { data: pipelineDetail, isLoading: stagesLoading } = usePipeline(pipelineId);

  const debouncedSearch = useDebouncedValue(search, 300);
  const selectedSizeBand = DEAL_SIZE_BANDS.find((b) => b.value === sizeBand);

  // One query object drives the board, the count and the stats strip, so the
  // tiles always describe exactly the rows shown beneath them.
  const query: OpportunityQuery = {
    pipelineId,
    accountId: accountIdFilter,
    isOpen: isOpenFilter,
    // The URL's ownerId is the initial value; the in-page picker overrides it.
    ownerId: owner !== UNSET ? owner : ownerIdFilter,
    q: debouncedSearch || undefined,
    minAmount: selectedSizeBand?.minAmount,
    maxAmount: selectedSizeBand?.maxAmount,
    take: FETCH_CAP,
  };

  const { data: liveOpportunities, isLoading: oppsLoading } = useOpportunities(query);
  const { data: countData } = useOpportunitiesCount(query);
  const { data: stats, isLoading: statsLoading } = useOpportunityStats(query);
  const opportunities = savedViewRows ?? liveOpportunities;
  const { accountsById } = useAccountsLookup();
  const { usersById } = useDirectoryUsers();
  const updateStage = useUpdateOpportunityStage();
  const bulkAssign = useBulkAssignOpportunities();
  const bulkDelete = useBulkDeleteOpportunities();

  const isLoading = pipelinesLoading || stagesLoading || oppsLoading || !pipelineId;

  const stages = (pipelineDetail?.stages ?? []).slice().sort((a, b) => a.order - b.order);
  const stageIds = new Set(stages.map((s) => s.id));
  // Rows can come from a Saved View that isn't scoped to the currently
  // selected pipeline (SavedViewBar's buildFilters only constrains
  // accountId — see its comment above) — an opportunity whose stage
  // belongs to a *different* pipeline has nowhere to render on this board.
  // Bucketing it under its own id used to silently drop it (the render
  // loop below only ever iterates `stages`); now it's excluded up front
  // and surfaced via the count below instead of vanishing.
  const allOpportunities = opportunities ?? [];
  const pipelineVisibleOpportunities = allOpportunities.filter((o) => stageIds.has(o.pipelineStageId));
  const visibleOpportunities = stageIdFilter ? pipelineVisibleOpportunities.filter((o) => o.pipelineStageId === stageIdFilter) : pipelineVisibleOpportunities;
  const excludedFromOtherPipelinesCount = allOpportunities.length - pipelineVisibleOpportunities.length;
  const realTotal = savedViewRows ? savedViewRows.length : (countData?.count ?? allOpportunities.length);
  const isTruncated = !savedViewRows && realTotal > allOpportunities.length;
  const hasActiveFilters = Boolean(debouncedSearch) || owner !== UNSET || sizeBand !== UNSET;
  const directoryUsers = React.useMemo(() => [...usersById.values()], [usersById]);
  const stageFilterName = stageIdFilter ? stages.find((s) => s.id === stageIdFilter)?.name : undefined;
  const byStage = new Map<string, Opportunity[]>();
  for (const stage of stages) byStage.set(stage.id, []);
  for (const opp of visibleOpportunities) {
    byStage.get(opp.pipelineStageId)!.push(opp);
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

  function clearFilters() {
    setSavedViewRows(null);
    setSearch('');
    setOwner(UNSET);
    setSizeBand(UNSET);
  }

  function handleExport() {
    const qs = new URLSearchParams();
    if (query.pipelineId) qs.set('pipelineId', query.pipelineId);
    if (query.accountId) qs.set('accountId', query.accountId);
    if (query.ownerId) qs.set('ownerId', query.ownerId);
    if (query.isOpen) qs.set('isOpen', 'true');
    if (query.q) qs.set('q', query.q);
    if (query.minAmount !== undefined) qs.set('minAmount', String(query.minAmount));
    if (query.maxAmount !== undefined) qs.set('maxAmount', String(query.maxAmount));
    window.location.href = `/api/crm/opportunities/export?${qs.toString()}`;
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
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'kanban' | 'table')}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kanban">Board</SelectItem>
                <SelectItem value="table">Table</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExport} disabled={realTotal === 0}>
              <Download aria-hidden /> Export
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden /> New opportunity
            </Button>
          </>
        }
      />

      <PipelineStatsStrip stats={stats} isLoading={statsLoading} />

      <SavedViewBar<Opportunity> entityType="OPPORTUNITY" buildFilters={buildFilters} onApply={setSavedViewRows} />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 lg:flex-row lg:items-end">
          <div className="w-full space-y-1.5 lg:max-w-xs">
            <label htmlFor="opportunity-search" className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="opportunity-search"
                value={search}
                onChange={(e) => {
                  setSavedViewRows(null);
                  setSearch(e.target.value);
                }}
                placeholder="Opportunity name"
                className="pl-8"
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Owner</label>
            <Select
              value={owner}
              onValueChange={(v) => {
                setSavedViewRows(null);
                setOwner(v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Anyone</SelectItem>
                {directoryUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <label className="text-xs font-medium text-muted-foreground">Deal size</label>
            <Select
              value={sizeBand}
              onValueChange={(v) => {
                setSavedViewRows(null);
                setSizeBand(v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Any size</SelectItem>
                {DEAL_SIZE_BANDS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 sm:mb-0.5">
              <X className="h-3.5 w-3.5" aria-hidden /> Clear filters
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isTruncated ? (
        <p className="text-sm text-muted-foreground">
          Showing the first {allOpportunities.length.toLocaleString()} of {realTotal.toLocaleString()} matching deals — narrow
          the filters, or use Export for the full set.
        </p>
      ) : null}

      {accountIdFilter ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered to account:</span>
          <Badge variant="secondary">{accountsById.get(accountIdFilter)?.name ?? accountIdFilter}</Badge>
          <Link href="/opportunities" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" aria-hidden /> Clear
          </Link>
        </div>
      ) : null}

      {stageFilterName || isOpenFilter ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered from dashboard:</span>
          {stageFilterName ? <Badge variant="secondary">Stage: {stageFilterName}</Badge> : null}
          {isOpenFilter ? <Badge variant="secondary">Open only</Badge> : null}
          <Link href="/opportunities" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" aria-hidden /> Clear
          </Link>
        </div>
      ) : null}

      {excludedFromOtherPipelinesCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {excludedFromOtherPipelinesCount} opportunit{excludedFromOtherPipelinesCount === 1 ? 'y' : 'ies'} from other pipelines aren&apos;t shown on
          this board — switch pipelines above to see them.
        </p>
      ) : null}

      {viewMode === 'table' ? (
        <OpportunitiesTableView
          opportunities={visibleOpportunities}
          stages={stages}
          accountsById={accountsById}
          usersById={usersById}
          isLoading={isLoading}
        />
      ) : (
        <>
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
                // A raw sum only means anything if every deal in the stage
                // shares one currency — otherwise (mixed NGN/USD/etc.)
                // labeling a combined number as one currency would be
                // actively wrong, not just imprecise. The real
                // currency-normalized total lives on the dashboard's own
                // KPIs (dashboards.controller.ts, via ExchangeRate); this
                // column header stays honest instead of pretending.
                const currencies = new Set(items.map((o) => o.currency));
                const singleCurrency = currencies.size <= 1 ? [...currencies][0] : undefined;
                return (
                  <div key={stage.id} className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30">
                    <div className="border-b border-border p-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-foreground">{stage.name}</h3>
                        <Badge variant={stage.isWon ? 'success' : stage.isLost ? 'destructive' : 'outline'}>{items.length}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {currencies.size > 1 ? 'Mixed currencies' : formatCurrency(total, singleCurrency)}
                      </p>
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
        </>
      )}

      <OpportunityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultPipelineStageId={stages[0]?.id}
      />
    </div>
  );
}
