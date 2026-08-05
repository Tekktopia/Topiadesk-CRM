import { Suspense } from 'react';
import { Skeleton } from '@topiadesk/ui';
import { LeadsListView } from './_components/leads-list-view';

export const metadata = {
  title: 'Leads',
};

export default function LeadsPage() {
  // LeadsListView reads the `?new=1` quick-create param (see
  // lib/use-quick-create-param.ts) via useSearchParams(), which Next.js
  // requires a Suspense boundary for at the page level.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <LeadsListView />
    </Suspense>
  );
}
