import { Suspense } from 'react';
import { Skeleton } from '@topiadesk/ui';
import { DuplicatesView } from './_components/duplicates-view';

export const metadata = {
  title: 'Find Duplicates',
};

export default function DuplicatesPage() {
  return (
    // DuplicatesView reads the `?entity=` preselection via useSearchParams()
    // — same Suspense-at-page-level requirement as opportunities/page.tsx.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <DuplicatesView />
    </Suspense>
  );
}
