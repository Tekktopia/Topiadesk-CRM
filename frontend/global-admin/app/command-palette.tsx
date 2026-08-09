'use client';

import * as React from 'react';
import { Building2, LifeBuoy, Loader2, Package, Search, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@topiadesk/ui';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  href: string;
}

// Same icon choices as lib/nav.ts's own entries, so a result reads
// consistently with the sidebar item for that section.
const TYPE_ICON: Record<string, LucideIcon> = {
  TENANT: Building2,
  PLAN: Package,
  PLATFORM_ADMIN: ShieldCheck,
  SUPPORT_TICKET: LifeBuoy,
};

const TYPE_LABEL: Record<string, string> = {
  TENANT: 'Tenants',
  PLAN: 'Plans',
  PLATFORM_ADMIN: 'Platform admins',
  SUPPORT_TICKET: 'Support tickets',
};

const TYPE_ORDER = ['TENANT', 'SUPPORT_TICKET', 'PLATFORM_ADMIN', 'PLAN'];

async function fetchSearch(q: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`, { credentials: 'same-origin' });
  if (!res.ok) return [];
  const body = (await res.json()) as { results: SearchResult[] };
  return body.results;
}

/** Ported from frontend/web/app/command-palette.tsx — same shortcut,
 * debounce, and grouping behavior, applied to the platform schema's
 * smaller set of entity types via GET /api/search (proxies to
 * /platform/search, platform-search.controller.ts). */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const trimmed = debouncedQuery.trim();
  const { data: results, isFetching } = useQuery({
    queryKey: ['global-search', trimmed],
    queryFn: () => fetchSearch(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
  });

  function handleSelect(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  const grouped = React.useMemo(() => {
    const byType = new Map<string, SearchResult[]>();
    for (const r of results ?? []) {
      const group = byType.get(r.type);
      if (group) group.push(r);
      else byType.set(r.type, [r]);
    }
    return TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({ type: t, items: byType.get(t)! }));
  }, [results]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full justify-start gap-2 border-white/10 bg-white/[0.04] text-muted-foreground backdrop-blur-sm hover:border-white/20 hover:bg-white/[0.07] hover:text-foreground"
        aria-label="Search everything"
      >
        <Search className="h-4 w-4" aria-hidden />
        Search…
        <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:flex">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput placeholder="Search tenants, admins, plans, tickets…" value={query} onValueChange={setQuery} />
        <CommandList>
          {trimmed.length < 2 ? (
            <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
          ) : isFetching && !results ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Searching…
            </div>
          ) : grouped.length === 0 ? (
            <CommandEmpty>No results for &ldquo;{trimmed}&rdquo;.</CommandEmpty>
          ) : (
            grouped.map(({ type, items }) => {
              const Icon = TYPE_ICON[type] ?? Search;
              return (
                <CommandGroup key={type} heading={TYPE_LABEL[type] ?? type}>
                  {items.map((item) => (
                    <CommandItem key={`${type}-${item.id}`} value={`${type}-${item.id}`} onSelect={() => handleSelect(item.href)}>
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{item.title}</span>
                      {item.subtitle ? <span className="ml-auto truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
