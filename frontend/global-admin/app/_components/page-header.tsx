import type { ReactNode } from 'react';

/** Consistent title/description/actions row used at the top of every
 * module page — direct copy of frontend/web's admin-section PageHeader
 * (frontend/web/app/(admin)/admin/_components/page-header.tsx). Plain
 * presentational component, no hooks, so no 'use client' needed even
 * though its callers are Client Components. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
