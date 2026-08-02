import { Suspense } from 'react';
import { Skeleton } from '@topiadesk/ui';
import { OpportunitiesKanbanView } from './_components/opportunities-kanban-view';

export const metadata = {
  title: 'Pipeline',
};

export default function OpportunitiesPage() {
  return (
    // OpportunitiesKanbanView reads the `?accountId=` filter via
    // useSearchParams(), which Next.js requires to be wrapped in a
    // Suspense boundary at the page level (otherwise the whole route
    // opts into a client-side-rendering bailout at build time).
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <OpportunitiesKanbanView />
    </Suspense>
  );
}
