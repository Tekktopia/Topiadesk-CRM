'use client';

import * as React from 'react';
import {
  Briefcase,
  Building2,
  CheckSquare,
  Contact2,
  FileClock,
  LifeBuoy,
  Loader2,
  Megaphone,
  Search,
  ShieldAlert,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@topiadesk/ui';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  href: string;
}

// Same icon choices as each route group's nav.ts, so a result reads
// consistently with the sidebar entry for that domain (see e.g.
// app/(crm)/nav.ts, app/(cases)/nav.ts). Contact has no nav entry of its
// own (reached only through an Account), so it gets a distinct icon here.
const TYPE_ICON: Record<string, LucideIcon> = {
  ACCOUNT: Building2,
  CONTACT: Contact2,
  LEAD: Target,
  OPPORTUNITY: Briefcase,
  CARRIER: Users,
  TASK: CheckSquare,
  POLICY: FileClock,
  CLAIM: ShieldAlert,
  CASE: LifeBuoy,
  CAMPAIGN: Megaphone,
  KNOWLEDGE_ARTICLE: Search,
};

const TYPE_LABEL: Record<string, string> = {
  ACCOUNT: 'Accounts',
  CONTACT: 'Contacts',
  LEAD: 'Leads',
  OPPORTUNITY: 'Opportunities',
  CARRIER: 'Carriers',
  TASK: 'Tasks',
  POLICY: 'Policies',
  CLAIM: 'Claims',
  CASE: 'Tickets',
  CAMPAIGN: 'Campaigns',
  KNOWLEDGE_ARTICLE: 'Knowledge base',
};

// Preserves this exact order in the rendered groups regardless of fetch
// order — matches roughly how often each entity type is looked up.
const TYPE_ORDER = ['ACCOUNT', 'CONTACT', 'LEAD', 'OPPORTUNITY', 'POLICY', 'CASE', 'CLAIM', 'CARRIER', 'TASK', 'CAMPAIGN', 'KNOWLEDGE_ARTICLE'];

async function fetchSearch(q: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`, { credentials: 'same-origin' });
  if (!res.ok) return [];
  const body = (await res.json()) as { results: SearchResult[] };
  return body.results;
}

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
        className="w-full justify-start gap-2 rounded-none bg-muted/60 text-muted-foreground hover:bg-muted"
        aria-label="Search everything"
      >
        <Search className="h-4 w-4" aria-hidden />
        Search…
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput placeholder="Search accounts, policies, tickets, claims…" value={query} onValueChange={setQuery} />
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
