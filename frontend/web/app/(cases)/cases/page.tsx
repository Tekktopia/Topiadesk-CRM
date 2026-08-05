import { Suspense } from 'react';
import { Skeleton } from '@topiadesk/ui';
import { CasesListView } from './_components/cases-list-view';

export const metadata = {
  title: 'Tickets',
};

export default function CasesPage() {
  // CasesListView reads the `?new=1` quick-create param (see
  // lib/use-quick-create-param.ts) via useSearchParams(), which Next.js
  // requires a Suspense boundary for at the page level.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CasesListView />
    </Suspense>
  );
}
