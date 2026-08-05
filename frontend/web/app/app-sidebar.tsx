'use client';

import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@topiadesk/ui';
import { AccountMenu } from './account-menu';
import { activeNavModule, NAV_MODULES, isNavItemActive } from './nav-modules';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import type { NavItem } from '@/lib/nav-types';

/**
 * Two-tier shell: a narrow icon rail (one icon per module — the same unit
 * as a route group's `nav.ts`, see nav-modules.ts) plus a wider panel
 * showing only the ACTIVE module's own sections/items. Replaces the
 * earlier single flat sidebar (all 8 groups' items concatenated into one
 * long scrolling list) — the module boundary was already real (one nav.ts
 * per route group), this just makes it visible instead of flattening it
 * away. `adminOnly` items are still filtered out entirely for non-admins,
 * same as before — the Admin rail icon itself never renders for them.
 */
const COLLAPSE_STORAGE_KEY = 'topiadesk.sidebar.collapsedSections';

/** Admins/compliance officers only — see canReadAdmin() in
 * app/(admin)/admin/_lib/permissions.ts for the backend-aligned check the
 * pages themselves use; this is the matching UX-only sidebar gate. */
function canSeeAdminOnly(roles: string[] | undefined): boolean {
  return !!roles && (roles.includes('ADMIN') || roles.includes('COMPLIANCE_OFFICER'));
}

function groupBySection(items: NavItem[]) {
  const top: NavItem[] = [];
  const sections = new Map<string, NavItem[]>();
  for (const item of items) {
    if (!item.section) {
      top.push(item);
      continue;
    }
    const group = sections.get(item.section);
    if (group) group.push(item);
    else sections.set(item.section, [item]);
  }
  return { top, sections };
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, isLoading } = useCurrentUser();
  const canAdmin = canSeeAdminOnly(user?.roles);

  const visibleModules = useMemo(() => NAV_MODULES.filter((m) => !m.adminOnly || canAdmin), [canAdmin]);
  const activeModule = useMemo(() => activeNavModule(pathname, visibleModules), [pathname, visibleModules]);
  const { top, sections } = useMemo(() => groupBySection(activeModule.items), [activeModule]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      // localStorage unavailable (private mode, etc.) — fall back to all-expanded.
    }
  }, []);

  function toggleSection(section: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore — persistence is a nicety, not required for correctness
      }
      return next;
    });
  }

  return (
    <div className="hidden md:flex">
      {/* Icon rail — one module per icon, active module highlighted, the
          current user's account menu pinned to the bottom (mt-auto). */}
      <nav aria-label="Modules" className="flex w-16 shrink-0 flex-col items-center gap-1 bg-primary py-3">
        <Link href="/" className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg" aria-label="TopiaDesk home">
          <Image src="/logo-mark.png" alt="" width={24} height={24} className="shrink-0" />
        </Link>
        {visibleModules.map((mod) => {
          const Icon = mod.icon;
          const active = mod.key === activeModule.key;
          return (
            <Link
              key={mod.key}
              href={mod.indexHref}
              aria-current={active ? 'page' : undefined}
              title={mod.label}
              className={`group flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                active ? 'bg-primary-foreground/15 text-primary-foreground' : 'text-primary-foreground/60 hover:bg-primary-foreground/10 hover:text-primary-foreground/90'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              <span className="text-[9px] font-medium leading-none">{mod.label}</span>
            </Link>
          );
        })}

        <div className="mt-auto pt-2">
          {isLoading ? <Skeleton className="h-9 w-9 rounded-full bg-primary-foreground/10" /> : user ? <AccountMenu user={user} side="right" /> : null}
        </div>
      </nav>

      {/* Expandable panel — the active module's own sections/items only. */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-14 items-center border-b border-border px-4">
          <span className="text-sm font-semibold tracking-tight text-foreground">{activeModule.label}</span>
        </div>
        <nav className="flex-1 space-y-3 overflow-y-auto p-2">
          <div className="space-y-0.5">
            {top.map((item) => (
              <NavLink key={item.href} item={item} active={isNavItemActive(pathname, item.href)} />
            ))}
          </div>
          {[...sections.entries()].map(([section, items]) => {
            const isCollapsed = collapsed.has(section);
            return (
              <div key={section}>
                <button
                  type="button"
                  onClick={() => toggleSection(section)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 transition-colors hover:text-foreground"
                  aria-expanded={!isCollapsed}
                >
                  {section}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    aria-hidden
                  />
                </button>
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavLink key={item.href} item={item} active={isNavItemActive(pathname, item.href)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-secondary text-secondary-foreground'
          : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}
