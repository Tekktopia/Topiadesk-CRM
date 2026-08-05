import { Suspense } from 'react';
import { Skeleton } from '@topiadesk/ui';
import { AccountsListView } from './_components/accounts-list-view';

export const metadata = {
  title: 'Accounts',
};

export default function AccountsPage() {
  // AccountsListView reads the `?new=1` quick-create param (see
  // lib/use-quick-create-param.ts) via useSearchParams(), which Next.js
  // requires a Suspense boundary for at the page level.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AccountsListView />
    </Suspense>
  );
}
