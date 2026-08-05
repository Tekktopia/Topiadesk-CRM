'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, LayoutGrid, Loader2, Pencil, Plus, RotateCcw, Save, X } from 'lucide-react';
import { Button, Card, CardContent, Input, Skeleton } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { AddWidgetDialog } from './add-widget-dialog';
import { DashboardWidgetTile } from './dashboard-widget-tile';
import { useCreateSavedDashboard, useDeleteSavedDashboard, useMyDashboards, useRenderSavedDashboard, useUpdateSavedDashboard } from './dashboard-hooks';
import type { DashboardWidgetSpec } from './types';

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

/**
 * Customizable widget grid below the Overview strip — resolution order on
 * load: the viewer's own most-recently-updated PRIVATE SavedDashboard,
 * else the seeded ORG dashboard matching their role, rendered via the
 * generic id-based render endpoint (SavedDashboardsController.render).
 * "Customize" forks the current view into (or edits) the viewer's own
 * PRIVATE copy — the seeded ORG defaults are never edited in place.
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

  const renderQuery = useRenderSavedDashboard(activeDashboard?.id);
  const createMutation = useCreateSavedDashboard();
  const updateMutation = useUpdateSavedDashboard(myDashboard?.id);
  const deleteMutation = useDeleteSavedDashboard();

  const [editing, setEditing] = useState(false);
  const [draftWidgets, setDraftWidgets] = useState<DashboardWidgetSpec[]>([]);
  const [draftName, setDraftName] = useState('My Dashboard');
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (editing) return;
    setDraftWidgets(activeDashboard?.widgets ?? []);
    setDraftName(myDashboard?.name ?? 'My Dashboard');
  }, [activeDashboard, myDashboard, editing]);

  function startEditing() {
    setDraftWidgets(activeDashboard?.widgets ?? []);
    setDraftName(myDashboard?.name ?? 'My Dashboard');
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  function moveWidget(index: number, direction: -1 | 1) {
    setDraftWidgets((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  }

  function removeWidget(index: number) {
    setDraftWidgets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const layoutConfig = { columns: 12, items: draftWidgets.map((w, i) => ({ widgetId: w.id, x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 })) };
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden />
          {editing ? (
            <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="h-8 w-56" />
          ) : (
            <h2 className="text-base font-semibold text-foreground">{isCustomized ? (activeDashboard?.name ?? 'My Dashboard') : (activeDashboard?.name ?? 'Dashboard')}</h2>
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
          ) : (
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
          )}
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
          // Lightweight arrange-by-title list while editing, not live chart
          // tiles — a freshly-added widget has no rendered data yet (only
          // the saved dashboard is rendered), so showing "fake" chart tiles
          // here would be misleading; the real charts appear again once
          // Save re-renders the dashboard.
          <ol className="space-y-2">
            {draftWidgets.map((w, i) => (
              <li key={w.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <span className="text-sm font-medium text-foreground">{w.title}</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => moveWidget(i, -1)} aria-label="Move up">
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === draftWidgets.length - 1} onClick={() => moveWidget(i, 1)} aria-label="Move down">
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeWidget(i)} aria-label="Remove widget">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )
      ) : renderQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (renderQuery.data?.widgets ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <LayoutGrid className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">No widgets yet</p>
            <p className="max-w-md text-sm text-muted-foreground">Customize your dashboard to add report widgets.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(renderQuery.data?.widgets ?? []).map((w) => (
            <DashboardWidgetTile key={w.id} widget={w} />
          ))}
        </div>
      )}

      <AddWidgetDialog open={addOpen} onOpenChange={setAddOpen} onAdd={(widget) => setDraftWidgets((prev) => [...prev, widget])} />
    </div>
  );
}
