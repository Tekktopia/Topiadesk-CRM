'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, MoreHorizontal, Plus } from 'lucide-react';
import { Badge, Button, Card, CardContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Skeleton } from '@topiadesk/ui';
import { ConfirmDialog } from '../../_components/confirm-dialog';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { useDeletePipeline, useDeletePipelineStage, usePipeline, usePipelines, useReorderPipelineStages } from '../../_lib/hooks';
import type { Pipeline, PipelineStage } from '../../_lib/types';
import { PipelineFormDialog } from './pipeline-form-dialog';
import { StageFormDialog } from './stage-form-dialog';

export function PipelineSetupView() {
  const { data: pipelines, isLoading, isError } = usePipelines();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const first = pipelines?.[0];
    if (!selectedId && first) setSelectedId(first.id);
  }, [pipelines, selectedId]);

  const [creatingPipeline, setCreatingPipeline] = React.useState(false);
  const [editingPipeline, setEditingPipeline] = React.useState<Pipeline | null>(null);
  const [deletingPipeline, setDeletingPipeline] = React.useState<Pipeline | null>(null);

  const deletePipeline = useDeletePipeline();

  const selected = pipelines?.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline Setup"
        description="The stages every opportunity moves through, per pipeline (e.g. New Business vs. Renewals). Changes here reshape the Pipeline board immediately for every user."
        actions={
          <Button size="sm" onClick={() => setCreatingPipeline(true)}>
            <Plus className="h-4 w-4" /> New pipeline
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">Couldn&apos;t load pipelines.</CardContent>
        </Card>
      ) : (pipelines ?? []).length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No pipelines yet"
              description="Create one to start defining the stages deals move through."
              action={
                <Button variant="outline" onClick={() => setCreatingPipeline(true)}>
                  <Plus className="h-4 w-4" /> New pipeline
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit">
            <CardContent className="space-y-1 p-2">
              {pipelines?.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    p.id === selectedId ? 'bg-secondary text-secondary-foreground' : 'hover:bg-secondary/50'
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2 font-medium text-foreground">
                    {p.name}
                    <Badge variant={p.isActive ? 'success' : 'secondary'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                  </span>
                  {p.lineOfBusiness ? <span className="text-xs text-muted-foreground">{p.lineOfBusiness}</span> : null}
                </button>
              ))}
            </CardContent>
          </Card>

          {selected ? (
            <StagesPanel
              key={selected.id}
              pipeline={selected}
              onEditPipeline={() => setEditingPipeline(selected)}
              onDeletePipeline={() => setDeletingPipeline(selected)}
            />
          ) : null}
        </div>
      )}

      <PipelineFormDialog open={creatingPipeline} onOpenChange={setCreatingPipeline} />
      {editingPipeline ? (
        <PipelineFormDialog open={Boolean(editingPipeline)} onOpenChange={(open) => !open && setEditingPipeline(null)} pipeline={editingPipeline} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deletingPipeline)}
        onOpenChange={(open) => !open && setDeletingPipeline(null)}
        title={`Delete "${deletingPipeline?.name}"?`}
        description="This only works if no stage on it has any opportunities left — reassign or close those out first. This cannot be undone."
        confirmLabel="Delete pipeline"
        destructive
        isPending={deletePipeline.isPending}
        onConfirm={() => {
          if (!deletingPipeline) return;
          deletePipeline.mutate(deletingPipeline.id, {
            onSuccess: () => {
              setDeletingPipeline(null);
              if (selectedId === deletingPipeline.id) setSelectedId(null);
            },
          });
        }}
      />
    </div>
  );
}

function StagesPanel({ pipeline, onEditPipeline, onDeletePipeline }: { pipeline: Pipeline; onEditPipeline: () => void; onDeletePipeline: () => void }) {
  const { data: detail, isLoading } = usePipeline(pipeline.id);
  const reorder = useReorderPipelineStages(pipeline.id);
  const deleteStage = useDeletePipelineStage(pipeline.id);

  const [creatingStage, setCreatingStage] = React.useState(false);
  const [editingStage, setEditingStage] = React.useState<PipelineStage | null>(null);
  const [deletingStage, setDeletingStage] = React.useState<PipelineStage | null>(null);

  const stages = (detail?.stages ?? []).slice().sort((a, b) => a.order - b.order);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    const next = stages.slice();
    const moved = next.splice(index, 1)[0];
    if (!moved) return;
    next.splice(target, 0, moved);
    reorder.mutate(next.map((s) => s.id));
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">{pipeline.name}</p>
            <p className="text-xs text-muted-foreground">{stages.length} stage{stages.length === 1 ? '' : 's'}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setCreatingStage(true)}>
              <Plus className="h-4 w-4" /> New stage
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`${pipeline.name} actions`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEditPipeline}>Edit pipeline</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDeletePipeline}>
                  Delete pipeline
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : stages.length === 0 ? (
          <EmptyState
            title="No stages yet"
            description="Add the first stage a new opportunity lands in."
            action={
              <Button variant="outline" onClick={() => setCreatingStage(true)}>
                <Plus className="h-4 w-4" /> New stage
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {stages.map((stage, index) => (
              <div key={stage.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    aria-label={`Move ${stage.name} up`}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    aria-label={`Move ${stage.name} down`}
                    disabled={index === stages.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{index + 1}</span>
                <div className="flex flex-1 items-center gap-2">
                  <span className="font-medium text-foreground">{stage.name}</span>
                  {stage.isWon ? <Badge variant="success">Won</Badge> : null}
                  {stage.isLost ? <Badge variant="destructive">Lost</Badge> : null}
                </div>
                <span className="text-xs text-muted-foreground">{stage.defaultProbability}% default probability</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`${stage.name} actions`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditingStage(stage)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeletingStage(stage)}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <StageFormDialog open={creatingStage} onOpenChange={setCreatingStage} pipelineId={pipeline.id} nextOrder={stages.length} />
      {editingStage ? (
        <StageFormDialog
          open={Boolean(editingStage)}
          onOpenChange={(open) => !open && setEditingStage(null)}
          pipelineId={pipeline.id}
          stage={editingStage}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deletingStage)}
        onOpenChange={(open) => !open && setDeletingStage(null)}
        title={`Delete "${deletingStage?.name}"?`}
        description="This only works if no opportunity is currently sitting in this stage — move them first. This cannot be undone."
        confirmLabel="Delete stage"
        destructive
        isPending={deleteStage.isPending}
        onConfirm={() => {
          if (!deletingStage) return;
          deleteStage.mutate(deletingStage.id, { onSuccess: () => setDeletingStage(null) });
        }}
      />
    </Card>
  );
}
