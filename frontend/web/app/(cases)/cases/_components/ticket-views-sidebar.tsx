'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { cn, Input } from '@topiadesk/ui';
import { TICKET_VIEWS, TICKET_VIEW_SECTIONS } from './ticket-views';

export function TicketViewsSidebar({ activeViewId, onSelectView }: { activeViewId: string; onSelectView: (viewId: string) => void }) {
  const [search, setSearch] = React.useState('');
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({});

  const term = search.trim().toLowerCase();
  const filtered = term ? TICKET_VIEWS.filter((v) => v.label.toLowerCase().includes(term)) : TICKET_VIEWS;

  return (
    <div className="flex w-64 shrink-0 flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for a view" className="pl-8" />
      </div>

      {TICKET_VIEW_SECTIONS.map((section) => {
        const views = filtered.filter((v) => v.section === section);
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
    </div>
  );
}
