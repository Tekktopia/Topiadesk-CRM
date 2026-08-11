'use client';

import { useMemo, useState } from 'react';
import { LayoutGrid, Loader2, Pencil, Plus, RotateCcw, Save, X } from 'lucide-react';
import { Button, Card, CardContent, DashboardGrid, Input, Skeleton, Tabs, TabsList, TabsTrigger } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { AddWidgetDialog } from './add-widget-dialog';
import { DashboardWidgetTile } from './dashboard-widget-tile';
import { useCreateSavedDashboard, useDeleteSavedDashboard, useMyDashboards, useRenderPreview, useRenderSavedDashboard, useUpdateSavedDashboard } from './dashboard-hooks';
import type { DashboardWidgetSpec, GridLayoutItem, RenderedDashboardWidget } from './types';

const DEFAULT_W = 6;
const DEFAULT_H = 4;

/** ADMIN -> Executive, COMPLIANCE_OFFICER -> Compliance, MANAGER -> Branch
 * Manager, everyone else (ACCOUNT_HANDLER and any other role) -> Broker —
 * matches the 4 dashboards seeded in packages/db/prisma/seed.ts's
 * "role-flavored default dashboards" section (RoleDashboardsController's
 * 4 fixed routes read the same rows by name). */
function defaultDashboardNameForRoles(roles: string[]): string {
  if (roles.includes('ADMIN')) return 'Executive Dashboard';
  if (roles.includes('COMPLIANCE_OFFICER')) return 'Compliance Dashboard';
  if (roles.includes('MANAGER')) return 'Branch Manager Dashboard';
  return 'Broker Dashboard';
}

/** `layoutConfig` is untyped JSON end to end (SavedDashboard.layoutConfig / RenderedDashboard.layoutConfig) — parse defensively, same "best-effort, never throw on stored shape drift" posture as the rest of this module's rendering code. */
function parseLayoutItems(layoutConfig: unknown): GridLayoutItem[] {
  if (!layoutConfig || typeof layoutConfig !== 'object') return [];
  const items = (layoutConfig as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const result: GridLayoutItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as { widgetId?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown };
    if (typeof item.widgetId !== 'string') continue;
    result.push({ i: item.widgetId, x: Number(item.x) || 0, y: Number(item.y) || 0, w: Number(item.w) || DEFAULT_W, h: Number(item.h) || DEFAULT_H });
  }
  return result;
}

/** Every widget needs a grid position — for any id without a matching stored entry (a widget added since the layout was last saved, or first-ever save), fall back to the same left-to-right/top-to-bottom placement the pre-drag version of this page used to compute for every widget. */
function withFallbackPositions(widgetIds: string[], known: GridLayoutItem[]): GridLayoutItem[] {
  const knownById = new Map(known.map((l) => [l.i, l]));
  return widgetIds.map((id, i) => knownById.get(id) ?? { i: id, x: (i % 2) * 6, y: Math.floor(i / 2) * DEFAULT_H, w: DEFAULT_W, h: DEFAULT_H });
}

function nextGridY(layout: GridLayoutItem[]): number {
  return layout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
}

/**
 * Customizable widget grid below the Overview strip — resolution order on
 * load: the viewer's own most-recently-updated PRIVATE SavedDashboard,
 * else the seeded ORG dashboard matching their role, rendered via the
 * generic id-based render endpoint (SavedDashboardsController.render).
 * "Customize" forks the current view into (or edits) the viewer's own
 * PRIVATE copy — the seeded ORG defaults are never edited in place.
 *
 * Both view and edit mode render through the same `DashboardGrid` (real
 * react-grid-layout, packages/ui) — view mode with drag/resize disabled,
 * edit mode with both enabled and backed by a live preview
 * (useRenderPreview) so a widget just added or repositioned shows real
 * chart data immediately rather than a title-only placeholder.
 */
export function CustomDashboardSection() {
  const { user } = useCurrentUser();
  const dashboardsQuery = useMyDashboards();

  const myDashboard = useMemo(() => {
    const mine = (dashboardsQuery.data ?? []).filter((d) => d.ownerId === user?.id && d.visibility === 'PRIVATE');
    return mine.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  }, [dashboardsQuery.data, user?.id]);

  const defaultDashboard = useMemo(() => {
    const name = defaultDashboardNameForRoles(user?.roles ?? []);
    return (dashboardsQuery.data ?? []).find((d) => d.name === name && d.visibility === 'ORG');
  }, [dashboardsQuery.data, user?.roles]);

  const activeDashboard = myDashboard ?? defaultDashboard;
  const isCustomized = Boolean(myDashboard);

  // Every ORG-visibility dashboard the caller can see (useMyDashboards()
  // already fetches these — previously computed then discarded except for
  // the one role-matched default). Exposed as a "browse other views" tab
  // row alongside "My Dashboard" — read-only: Customize/Save/Reset only
  // ever act on the caller's own PRIVATE dashboard, never these shared
  // ORG rows, so switching tabs can't accidentally mutate shared data.
  const orgDashboards = useMemo(
    () => (dashboardsQuery.data ?? []).filter((d) => d.visibility === 'ORG').sort((a, b) => a.name.localeCompare(b.name)),
    [dashboardsQuery.data],
  );
  const [selectedTab, setSelectedTab] = useState('mine');
  const viewedDashboard = selectedTab === 'mine' ? activeDashboard : orgDashboards.find((d) => d.id === selectedTab);
  const viewingMine = selectedTab === 'mine';

  const renderQuery = useRenderSavedDashboard(viewedDashboard?.id);
  const previewMutation = useRenderPreview();
  const createMutation = useCreateSavedDashboard();
  const updateMutation = useUpdateSavedDashboard(myDashboard?.id);
  const deleteMutation = useDeleteSavedDashboard();

  const [editing, setEditing] = useState(false);
  const [draftWidgets, setDraftWidgets] = useState<DashboardWidgetSpec[]>([]);
  const [draftLayout, setDraftLayout] = useState<GridLayoutItem[]>([]);
  const [draftName, setDraftName] = useState('My Dashboard');
  const [addOpen, setAddOpen] = useState(false);

  const viewLayout = useMemo(
    () => withFallbackPositions((renderQuery.data?.widgets ?? []).map((w) => w.id), parseLayoutItems(renderQuery.data?.layoutConfig)),
    [renderQuery.data],
  );
  const previewWidgets: RenderedDashboardWidget[] = previewMutation.data ?? [];

  function startEditing() {
    const widgets = activeDashboard?.widgets ?? [];
    setDraftWidgets(widgets);
    setDraftLayout(withFallbackPositions(widgets.map((w) => w.id), parseLayoutItems(activeDashboard?.layoutConfig)));
    setDraftName(myDashboard?.name ?? 'My Dashboard');
    setEditing(true);
    if (widgets.length > 0) previewMutation.mutate(widgets);
  }

  function cancelEditing() {
    setEditing(false);
  }

  function addWidget(widget: DashboardWidgetSpec) {
    const nextWidgets = [...draftWidgets, widget];
    setDraftWidgets(nextWidgets);
    setDraftLayout((prev) => [...prev, { i: widget.id, x: 0, y: nextGridY(prev), w: DEFAULT_W, h: DEFAULT_H }]);
    previewMutation.mutate(nextWidgets);
  }

  function removeWidget(id: string) {
    const nextWidgets = draftWidgets.filter((w) => w.id !== id);
    setDraftWidgets(nextWidgets);
    setDraftLayout((prev) => prev.filter((l) => l.i !== id));
    previewMutation.mutate(nextWidgets);
  }

  async function handleSave() {
    const layoutConfig = { columns: 12, items: draftLayout.map((l) => ({ widgetId: l.i, x: l.x, y: l.y, w: l.w, h: l.h })) };
    if (myDashboard) {
      await updateMutation.mutateAsync({ name: draftName, widgets: draftWidgets, layoutConfig });
    } else {
      await createMutation.mutateAsync({ name: draftName, visibility: 'PRIVATE', widgets: draftWidgets, layoutConfig });
    }
    setEditing(false);
  }

  async function handleResetToDefault() {
    if (!myDashboard) return;
    await deleteMutation.mutateAsync(myDashboard.id);
    setEditing(false);
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          {editing ? (
            <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="h-8 w-56" />
          ) : orgDashboards.length > 0 ? (
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList>
                <TabsTrigger value="mine">{isCustomized ? (myDashboard?.name ?? 'My Dashboard') : 'My Dashboard'}</TabsTrigger>
                {orgDashboards.map((d) => (
                  <TabsTrigger key={d.id} value={d.id}>
                    {d.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : (
            <h2 className="text-base font-semibold text-foreground">{viewedDashboard?.name ?? 'Dashboard'}</h2>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add widget
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEditing}>
                <X className="h-3.5 w-3.5" aria-hidden /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                Save
              </Button>
            </>
          ) : viewingMine ? (
            <>
              {isCustomized ? (
                <Button variant="outline" size="sm" onClick={handleResetToDefault} disabled={deleteMutation.isPending} className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset to default
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Customize
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {editing ? (
        draftWidgets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <LayoutGrid className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">No widgets yet</p>
              <p className="max-w-md text-sm text-muted-foreground">Add a widget to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <DashboardGrid layout={draftLayout} onLayoutChange={setDraftLayout} isDraggable isResizable rowHeight={80}>
            {draftWidgets.map((w) => {
              const rendered = previewWidgets.find((p) => p.id === w.id);
              return (
                <div key={w.id}>
                  {rendered ? (
                    <DashboardWidgetTile widget={rendered} editable onRemove={() => removeWidget(w.id)} />
                  ) : (
                    <div className="dashboard-grid-handle flex h-full cursor-move flex-col rounded-lg border border-border bg-card p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{w.title}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeWidget(w.id)} aria-label="Remove widget">
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                      <Skeleton className="flex-1 w-full" />
                    </div>
                  )}
                </div>
              );
            })}
          </DashboardGrid>
        )
      ) : renderQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (renderQuery.data?.widgets ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <LayoutGrid className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">No widgets yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {viewingMine ? 'Customize your dashboard to add report widgets.' : 'This dashboard has no widgets yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <DashboardGrid layout={viewLayout} isDraggable={false} isResizable={false} rowHeight={80}>
          {(renderQuery.data?.widgets ?? []).map((w) => (
            <div key={w.id}>
              <DashboardWidgetTile widget={w} />
            </div>
          ))}
        </DashboardGrid>
      )}

      <AddWidgetDialog open={addOpen} onOpenChange={setAddOpen} onAdd={addWidget} />
    </div>
  );
}
