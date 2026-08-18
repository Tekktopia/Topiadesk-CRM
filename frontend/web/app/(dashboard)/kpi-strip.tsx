'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Building2,
  CalendarClock,
  Loader2,
  Pencil,
  Percent,
  Plus,
  Save,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Button, Card, CardContent, Checkbox, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, GradientStatTile, Skeleton, toast } from '@topiadesk/ui';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import { csrfHeaders } from '@/lib/csrf';
import { DEFAULT_KPI_TILE_KEYS, KPI_TILE_CATALOG, resolveKpiTileKeys, type KpiTileIconName, type KpiTileSpec } from './kpi-tile-catalog';
import type { OperationalKpis } from './dashboard-hooks';

const ICONS: Record<KpiTileIconName, React.ComponentType<{ className?: string }>> = {
  Briefcase,
  TrendingUp,
  CalendarClock,
  Users,
  Trophy,
  Percent,
  Building2,
  UserPlus,
  Target,
  ShieldCheck,
  Wallet,
  TrendingDown,
};

/** repeat(auto-fit, minmax(...)) reflows to however many tiles are selected (6, 8, 12...) without breakpoint-specific column tuning — the client-requested "auto fit" behavior, replacing the old fixed sm:2/lg:3/xl:6 grid. */
const AUTO_FIT_GRID_STYLE: React.CSSProperties = { gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' };

interface KpiStripProps {
  kpis: OperationalKpis | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * The main dashboard's top KPI strip — customizable per-user: which tiles
 * (of KPI_TILE_CATALOG) show and in what order, persisted via
 * User.kpiTilePreferences (PATCH /identity/me). Edit-mode idiom (Customize
 * button -> Cancel/Save, remove "x" in each tile's corner, "Add tile"
 * dialog) deliberately mirrors custom-dashboard-section.tsx's existing
 * pattern rather than inventing a new one.
 */
export function KpiStrip({ kpis, isLoading, isError }: KpiStripProps) {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [draftKeys, setDraftKeys] = React.useState<string[]>(DEFAULT_KPI_TILE_KEYS);
  const [addOpen, setAddOpen] = React.useState(false);

  const savedKeys = React.useMemo(() => resolveKpiTileKeys(user?.kpiTilePreferences), [user?.kpiTilePreferences]);
  const activeKeys = editing ? draftKeys : savedKeys;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const saveMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders('PATCH') },
        body: JSON.stringify({ kpiTilePreferences: keys }),
      });
      if (!res.ok) throw new Error('Failed to save tile preferences');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Dashboard tiles saved');
      queryClient.invalidateQueries({ queryKey: ['auth', 'current-user'] });
      setEditing(false);
    },
    onError: () => toast.error('Failed to save tile preferences'),
  });

  function startEditing() {
    setDraftKeys(savedKeys);
    setEditing(true);
  }
  function cancelEditing() {
    setEditing(false);
  }
  function removeTile(key: string) {
    setDraftKeys((prev) => prev.filter((k) => k !== key));
  }
  function addTiles(keys: string[]) {
    setDraftKeys((prev) => [...prev, ...keys]);
    setAddOpen(false);
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraftKeys((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const tiles = activeKeys.map((key) => KPI_TILE_CATALOG.find((t) => t.key === key)).filter((t): t is KpiTileSpec => Boolean(t));
  const hiddenTiles = KPI_TILE_CATALOG.filter((t) => !draftKeys.includes(t.key));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {editing ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} disabled={hiddenTiles.length === 0} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add tile
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelEditing}>
              <X className="h-3.5 w-3.5" aria-hidden /> Cancel
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate(draftKeys)} disabled={saveMutation.isPending || draftKeys.length === 0} className="gap-1.5">
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
              Save
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Customize tiles
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4" style={AUTO_FIT_GRID_STYLE}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] w-full rounded-lg" />
          ))}
        </div>
      ) : isError || !kpis ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">Couldn&apos;t load operational KPIs.</CardContent>
        </Card>
      ) : editing ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draftKeys} strategy={rectSortingStrategy}>
            <div className="grid gap-4" style={AUTO_FIT_GRID_STYLE}>
              {tiles.map((tile) => (
                <SortableKpiTile key={tile.key} tile={tile} kpis={kpis} onRemove={() => removeTile(tile.key)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="grid gap-4" style={AUTO_FIT_GRID_STYLE}>
          {tiles.map((tile) => {
            const Icon = ICONS[tile.icon];
            const content = <GradientStatTile accent={tile.accent} label={tile.label} value={tile.value(kpis)} icon={<Icon />} description={tile.description(kpis)} />;
            return tile.href ? (
              <Link key={tile.key} href={tile.href} className="block rounded-lg transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring">
                {content}
              </Link>
            ) : (
              <div key={tile.key}>{content}</div>
            );
          })}
        </div>
      )}

      <AddKpiTileDialog open={addOpen} onOpenChange={setAddOpen} hiddenTiles={hiddenTiles} onAdd={addTiles} />
    </div>
  );
}

function SortableKpiTile({ tile, kpis, onRemove }: { tile: KpiTileSpec; kpis: OperationalKpis; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.key });
  const Icon = ICONS[tile.icon];
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div {...attributes} {...listeners} className="cursor-move touch-none">
        <GradientStatTile accent={tile.accent} label={tile.label} value={tile.value(kpis)} icon={<Icon />} description={tile.description(kpis)} />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1.5 top-1.5 h-6 w-6 bg-black/10 text-white hover:bg-black/20 hover:text-white"
        onClick={onRemove}
        aria-label={`Remove ${tile.label}`}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}

function AddKpiTileDialog({
  open,
  onOpenChange,
  hiddenTiles,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hiddenTiles: KpiTileSpec[];
  onAdd: (keys: string[]) => void;
}) {
  const [selected, setSelected] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add tiles</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto py-2">
          {hiddenTiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">All available tiles are already shown.</p>
          ) : (
            hiddenTiles.map((tile) => (
              <label key={tile.key} className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-muted/50">
                <Checkbox
                  checked={selected.includes(tile.key)}
                  onCheckedChange={(checked) => setSelected((prev) => (checked ? [...prev, tile.key] : prev.filter((k) => k !== tile.key)))}
                />
                {tile.label}
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onAdd(selected)} disabled={selected.length === 0}>
            Add {selected.length > 0 ? `${selected.length} ` : ''}tile{selected.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
