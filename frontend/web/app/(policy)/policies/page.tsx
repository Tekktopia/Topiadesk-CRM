import { PoliciesView } from './policies-view';

export const metadata = {
  title: 'Policies',
};

/** Server Component shell (so it can export `metadata`) — all data
 * fetching/interactivity lives in the Client Component, via TanStack Query
 * against the same-origin app/api/policies proxy. */
export default function PoliciesPage() {
  return <PoliciesView />;
}
