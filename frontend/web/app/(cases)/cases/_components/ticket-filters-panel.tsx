'use client';

import * as React from 'react';
import { ChevronDown, X } from 'lucide-react';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import { useDirectoryUsers, useTeams } from '../../_lib/hooks';
import type { CaseQuery, DateRangePreset, ResolutionDueByPreset } from '../../_lib/types';
import { DATE_RANGE_PRESETS, RESOLUTION_DUE_BY_PRESETS } from '../../_lib/types';

const UNSET = '__any';

export interface TicketFilterFields {
  search: string;
  agentIds: string[];
  teamIds: string[];
  createdPreset: DateRangePreset | '';
  closedPreset: DateRangePreset | '';
  resolvedPreset: DateRangePreset | '';
  resolutionDueBy: ResolutionDueByPreset | '';
}

export const EMPTY_TICKET_FILTERS: TicketFilterFields = {
  search: '',
  agentIds: [],
  teamIds: [],
  createdPreset: '',
  closedPreset: '',
  resolvedPreset: '',
  resolutionDueBy: '',
};

/** Only ever adds a key when the corresponding field is actually set — an object spread with `undefined` placeholders would silently clobber a filter the active preset view already set (e.g. "My Overdue Tickets"'s resolutionDueBy). */
export function ticketFilterFieldsToQuery(f: TicketFilterFields): Partial<CaseQuery> {
  const q: Partial<CaseQuery> = {};
  if (f.search.trim()) q.search = f.search.trim();
  if (f.agentIds.length > 0) q.assignedToIds = f.agentIds;
  if (f.teamIds.length > 0) q.assignedTeamIds = f.teamIds;
  if (f.createdPreset) q.createdPreset = f.createdPreset;
  if (f.closedPreset) q.closedPreset = f.closedPreset;
  if (f.resolvedPreset) q.resolvedPreset = f.resolvedPreset;
  if (f.resolutionDueBy) q.resolutionDueBy = f.resolutionDueBy;
  return q;
}

export function countActiveTicketFilters(f: TicketFilterFields): number {
  return Object.keys(ticketFilterFieldsToQuery(f)).length;
}

const DATE_PRESET_LABEL: Record<DateRangePreset, string> = {
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  THIS_WEEK: 'This week',
  THIS_MONTH: 'This month',
};

const DUE_BY_LABEL: Record<ResolutionDueByPreset, string> = {
  OVERDUE: 'Overdue',
  DUE_TODAY: 'Due today',
  DUE_THIS_WEEK: 'Due this week',
};

function MultiSelectField({
  label,
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const selectedLabels = options.filter((o) => selectedIds.includes(o.id)).map((o) => o.label);
  const summary = selectedLabels.length === 0 ? 'Any' : selectedLabels.length <= 2 ? selectedLabels.join(', ') : `${selectedLabels.length} selected`;

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal">
            <span className="truncate text-left">{summary}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">Nothing to select</div>
          ) : (
            options.map((o) => (
              <DropdownMenuCheckboxItem
                key={o.id}
                checked={selectedIds.includes(o.id)}
                onSelect={(event) => {
                  event.preventDefault();
                  toggle(o.id);
                }}
              >
                {o.label}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function PresetSelect({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  labels: Record<string, string>;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value || UNSET} onValueChange={(v) => onChange(v === UNSET ? '' : v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET}>Any time</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {labels[o]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Right-side filters panel. `applied` is what's actually driving the live
 * ticket query; the panel keeps its own local `draft` copy so edits only
 * take effect once Apply is pressed (matching the reference screenshot,
 * not instant-apply-per-field). "Show applied filters" swaps in a
 * removable-chip summary of `applied` above the form — removing a chip
 * takes effect immediately (no separate Apply needed for a removal).
 */
export function TicketFiltersPanel({
  currentUserId,
  applied,
  onApply,
}: {
  currentUserId: string;
  applied: TicketFilterFields;
  onApply: (next: TicketFilterFields) => void;
}) {
  const [draft, setDraft] = React.useState<TicketFilterFields>(applied);
  const [showingApplied, setShowingApplied] = React.useState(false);
  const { users } = useDirectoryUsers();
  const { teams } = useTeams();

  React.useEffect(() => setDraft(applied), [applied]);

  const agentOptions = React.useMemo(
    () => [{ id: currentUserId, label: 'Me' }, ...users.filter((u) => u.id !== currentUserId).map((u) => ({ id: u.id, label: u.fullName }))],
    [users, currentUserId],
  );
  const teamOptions = React.useMemo(() => teams.map((t) => ({ id: t.id, label: t.name })), [teams]);

  const activeCount = countActiveTicketFilters(applied);

  function removeAppliedField(key: keyof TicketFilterFields) {
    const next: TicketFilterFields = { ...applied, [key]: Array.isArray(applied[key]) ? [] : '' };
    onApply(next);
  }

  const chips: { key: keyof TicketFilterFields; label: string }[] = [];
  if (applied.search.trim()) chips.push({ key: 'search', label: `Search: "${applied.search.trim()}"` });
  if (applied.agentIds.length > 0) chips.push({ key: 'agentIds', label: `Agents: ${agentOptions.filter((o) => applied.agentIds.includes(o.id)).map((o) => o.label).join(', ')}` });
  if (applied.teamIds.length > 0) chips.push({ key: 'teamIds', label: `Groups: ${teamOptions.filter((o) => applied.teamIds.includes(o.id)).map((o) => o.label).join(', ')}` });
  if (applied.createdPreset) chips.push({ key: 'createdPreset', label: `Created: ${DATE_PRESET_LABEL[applied.createdPreset]}` });
  if (applied.closedPreset) chips.push({ key: 'closedPreset', label: `Closed at: ${DATE_PRESET_LABEL[applied.closedPreset]}` });
  if (applied.resolvedPreset) chips.push({ key: 'resolvedPreset', label: `Resolved at: ${DATE_PRESET_LABEL[applied.resolvedPreset]}` });
  if (applied.resolutionDueBy) chips.push({ key: 'resolutionDueBy', label: `Resolution due by: ${DUE_BY_LABEL[applied.resolutionDueBy]}` });

  return (
    <div className="flex w-80 shrink-0 flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filters</span>
        <button
          type="button"
          onClick={() => setShowingApplied((v) => !v)}
          className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
          disabled={activeCount === 0}
        >
          {showingApplied ? 'Edit filters' : 'Show applied filters'}
        </button>
      </div>

      {showingApplied ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.length === 0 ? (
            <p className="text-sm text-muted-foreground">No filters applied.</p>
          ) : (
            chips.map((chip) => (
              <span key={chip.key} className="inline-flex items-center gap-1 rounded-none bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                {chip.label}
                <button type="button" onClick={() => removeAppliedField(chip.key)} aria-label={`Remove ${chip.label}`}>
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Search fields</label>
            <Input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} placeholder="Subject or ticket #" />
          </div>

          <MultiSelectField label="Agents Include" options={agentOptions} selectedIds={draft.agentIds} onChange={(ids) => setDraft({ ...draft, agentIds: ids })} />
          <MultiSelectField label="Groups Include" options={teamOptions} selectedIds={draft.teamIds} onChange={(ids) => setDraft({ ...draft, teamIds: ids })} />

          <PresetSelect label="Created" value={draft.createdPreset} onChange={(v) => setDraft({ ...draft, createdPreset: v as DateRangePreset | '' })} options={DATE_RANGE_PRESETS} labels={DATE_PRESET_LABEL} />
          <PresetSelect label="Closed at" value={draft.closedPreset} onChange={(v) => setDraft({ ...draft, closedPreset: v as DateRangePreset | '' })} options={DATE_RANGE_PRESETS} labels={DATE_PRESET_LABEL} />
          <PresetSelect label="Resolved at" value={draft.resolvedPreset} onChange={(v) => setDraft({ ...draft, resolvedPreset: v as DateRangePreset | '' })} options={DATE_RANGE_PRESETS} labels={DATE_PRESET_LABEL} />
          <PresetSelect label="Resolution due by" value={draft.resolutionDueBy} onChange={(v) => setDraft({ ...draft, resolutionDueBy: v as ResolutionDueByPreset | '' })} options={RESOLUTION_DUE_BY_PRESETS} labels={DUE_BY_LABEL} />

          <Button className={cn('mt-1')} onClick={() => onApply(draft)}>
            Apply
          </Button>
        </>
      )}
    </div>
  );
}
