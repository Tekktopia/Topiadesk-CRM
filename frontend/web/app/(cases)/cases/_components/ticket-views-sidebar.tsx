'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, Plus, Search, Trash2 } from 'lucide-react';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { useCreateCaseSavedView, useDeleteCaseSavedView } from '../../_lib/hooks';
import type { CaseQuery, CaseSavedView, SavedViewVisibility } from '../../_lib/types';
import { TICKET_VIEWS, TICKET_VIEW_SECTIONS } from './ticket-views';

const VISIBILITY_OPTIONS: { value: SavedViewVisibility; label: string }[] = [
  { value: 'PRIVATE', label: 'Only me' },
  { value: 'TEAM', label: 'My team' },
  { value: 'DEPARTMENT', label: 'My department' },
  { value: 'ORG', label: 'Everyone' },
];

/**
 * "Save current filters as view" — a small dialog, name + visibility, same
 * options (crm)/_components/saved-view-bar.tsx already offers on Accounts.
 * Visibility is enforced at the RLS layer (saved_views_rw), same isolation
 * guarantee Accounts already proves: PRIVATE is invisible to every other
 * user, including another user who saves their own PRIVATE view under the
 * same name.
 */
function SaveViewDialog({ open, onOpenChange, currentFilters }: { open: boolean; onOpenChange: (open: boolean) => void; currentFilters: CaseQuery }) {
  const [name, setName] = React.useState('');
  const [visibility, setVisibility] = React.useState<SavedViewVisibility>('PRIVATE');
  const createView = useCreateCaseSavedView();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setName('');
          setVisibility('PRIVATE');
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save current filters as a view</DialogTitle>
          <DialogDescription>Captures every active filter and sort — reapply it any time from "My Views".</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            createView.mutate(
              { name, visibility, filters: currentFilters },
              { onSuccess: () => onOpenChange(false) },
            );
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="view-name">Name</Label>
            <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Escalated renewals" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="view-visibility">Who can see this</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as SavedViewVisibility)}>
              <SelectTrigger id="view-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createView.isPending || !name.trim()}>
              {createView.isPending ? 'Saving…' : 'Save view'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TicketViewsSidebar({
  activeViewId,
  onSelectView,
  savedViews,
  currentFilters,
}: {
  activeViewId: string;
  onSelectView: (viewId: string) => void;
  savedViews: CaseSavedView[];
  currentFilters: CaseQuery;
}) {
  const [search, setSearch] = React.useState('');
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({});
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const deleteView = useDeleteCaseSavedView();

  const term = search.trim().toLowerCase();
  const filteredPresets = term ? TICKET_VIEWS.filter((v) => v.label.toLowerCase().includes(term)) : TICKET_VIEWS;
  const filteredSavedViews = term ? savedViews.filter((v) => v.name.toLowerCase().includes(term)) : savedViews;

  return (
    <div className="flex w-64 shrink-0 flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for a view" className="pl-8" />
      </div>

      <div>
        <div className="flex w-full items-center justify-between px-1 pb-1.5">
          <button
            type="button"
            onClick={() => setCollapsedSections((prev) => ({ ...prev, 'My Views': !prev['My Views'] }))}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            My Views
            {collapsedSections['My Views'] ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronUp className="h-3.5 w-3.5" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => setSaveDialogOpen(true)}
            aria-label="Save current filters as a view"
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {!collapsedSections['My Views'] ? (
          filteredSavedViews.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">No saved views yet — save your current filters with the + above.</p>
          ) : (
            <ul className="space-y-0.5">
              {filteredSavedViews.map((view) => {
                const active = view.id === activeViewId;
                return (
                  <li key={view.id} className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => onSelectView(view.id)}
                      className={cn(
                        'flex flex-1 items-center gap-2 rounded-md border-l-2 px-2 py-1.5 text-left text-sm transition-colors',
                        active ? 'border-l-primary bg-primary/10 font-medium text-primary' : 'border-l-transparent text-foreground hover:bg-secondary/60',
                      )}
                    >
                      <span className="truncate">{view.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteView.mutate(view.id)}
                      aria-label={`Delete view ${view.name}`}
                      className="rounded p-1 text-muted-foreground opacity-0 hover:bg-secondary/60 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </div>

      {TICKET_VIEW_SECTIONS.map((section) => {
        const views = filteredPresets.filter((v) => v.section === section);
        if (views.length === 0) return null;
        const isCollapsed = collapsedSections[section] ?? false;
        return (
          <div key={section}>
            <button
              type="button"
              onClick={() => setCollapsedSections((prev) => ({ ...prev, [section]: !isCollapsed }))}
              className="flex w-full items-center justify-between px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              {section}
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronUp className="h-3.5 w-3.5" aria-hidden />}
            </button>
            {!isCollapsed ? (
              <ul className="space-y-0.5">
                {views.map((view) => {
                  const Icon = view.icon;
                  const active = view.id === activeViewId;
                  return (
                    <li key={view.id}>
                      <button
                        type="button"
                        onClick={() => onSelectView(view.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md border-l-2 px-2 py-1.5 text-left text-sm transition-colors',
                          active ? 'border-l-primary bg-primary/10 font-medium text-primary' : 'border-l-transparent text-foreground hover:bg-secondary/60',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">{view.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}

      <SaveViewDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen} currentFilters={currentFilters} />
    </div>
  );
}
