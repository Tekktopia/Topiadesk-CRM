'use client';

import * as React from 'react';
import { Save, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { SAVED_VIEW_VISIBILITIES, savedViewVisibilityLabel } from '../_lib/constants';
import { useCreateSavedView, useDeleteSavedView, useRunSavedView, useSavedViews } from '../_lib/hooks';
import type { FilterTree, SavedView, SavedViewEntityType, SavedViewVisibility } from '../_lib/types';

const UNSET = '__none';

/**
 * Load/save bar for a list view's saved filter presets. Selecting a view
 * runs it server-side (POST /crm/saved-views/:id/run, against the fixed
 * allowlist in saved-view-filters.ts) and hands the resulting rows to
 * `onApply` — the caller renders those in place of its normal live query
 * result until the view is cleared (`onApply(null)`) or a manual filter
 * control is touched again.
 *
 * `buildFilters` is called lazily, only when "Save view" is actually
 * submitted, so it always reflects whatever simple filter state the caller
 * has live at that moment (status/search/etc.) translated into the
 * FilterTree shape saved-view-filters.ts expects.
 */
export function SavedViewBar<T>({
  entityType,
  buildFilters,
  onApply,
}: {
  entityType: SavedViewEntityType;
  buildFilters: () => FilterTree;
  onApply: (rows: T[] | null) => void;
}) {
  const { data: views } = useSavedViews(entityType);
  const [selectedId, setSelectedId] = React.useState(UNSET);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const runView = useRunSavedView<T>();
  const deleteView = useDeleteSavedView(entityType);

  async function handleSelect(id: string) {
    setSelectedId(id);
    if (id === UNSET) {
      onApply(null);
      return;
    }
    const result = await runView.mutateAsync({ id, take: 200 });
    onApply(result.rows);
  }

  function handleDelete() {
    if (selectedId === UNSET) return;
    deleteView.mutate(selectedId);
    setSelectedId(UNSET);
    onApply(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selectedId} onValueChange={handleSelect}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Saved views" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET}>No saved view</SelectItem>
          {(views ?? []).map((view) => (
            <SelectItem key={view.id} value={view.id}>
              {view.name}
              {view.visibility !== 'PRIVATE' ? ` — ${savedViewVisibilityLabel(view.visibility)}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedId !== UNSET ? (
        <Button variant="ghost" size="icon" aria-label="Delete this saved view" onClick={handleDelete} disabled={deleteView.isPending}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
      <Button type="button" variant="outline" onClick={() => setSaveOpen(true)}>
        <Save aria-hidden /> Save current view
      </Button>

      <SaveViewDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        entityType={entityType}
        buildFilters={buildFilters}
        onSaved={(view) => setSelectedId(view.id)}
      />
    </div>
  );
}

function SaveViewDialog({
  open,
  onOpenChange,
  entityType,
  buildFilters,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: SavedViewEntityType;
  buildFilters: () => FilterTree;
  onSaved: (view: SavedView) => void;
}) {
  const [name, setName] = React.useState('');
  const [visibility, setVisibility] = React.useState<SavedViewVisibility>('PRIVATE');
  const [teamId, setTeamId] = React.useState('');
  const createView = useCreateSavedView();

  React.useEffect(() => {
    if (open) {
      setName('');
      setVisibility('PRIVATE');
      setTeamId('');
    }
  }, [open]);

  async function handleSave() {
    if (!name.trim()) return;
    const view = await createView.mutateAsync({
      entityType,
      name: name.trim(),
      visibility,
      teamId: visibility === 'TEAM' ? teamId || undefined : undefined,
      filters: buildFilters(),
    });
    onSaved(view);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save current view</DialogTitle>
          <DialogDescription>Stores the filters currently applied on this list so you (or your team) can reapply them later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="saved-view-name">
              Name
            </label>
            <Input id="saved-view-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My open renewals" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Visibility</label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as SavedViewVisibility)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* DEPARTMENT is a real SavedViewVisibility value (see schema.prisma) but left off this
                    picker — the brief calls for Only me/Team/Everyone, and there's no department-lookup
                    UI in this module to pair with it. */}
                {SAVED_VIEW_VISIBILITIES.filter((v) => v !== 'DEPARTMENT').map((v) => (
                  <SelectItem key={v} value={v}>
                    {savedViewVisibilityLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {visibility === 'TEAM' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="saved-view-team">
                Team ID
              </label>
              <Input id="saved-view-team" value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="Team UUID" />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createView.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={createView.isPending || !name.trim()}>
            Save view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
