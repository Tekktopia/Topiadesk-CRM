const SCALAR_FILTER_KEYS = [
  'status',
  'priority',
  'caseType',
  'assignedToId',
  'assignedTeamId',
  'accountId',
  'categoryId',
  'parentCaseId',
  'myTeams',
  'raisedByUserId',
  'watchingUserId',
  'newOrMine',
  'undeliveredOnly',
  'resolutionDueBy',
  'createdPreset',
  'closedPreset',
  'resolvedPreset',
  'search',
  'skip',
  'take',
  'sortBy',
  'sortDir',
] as const;

const ARRAY_FILTER_KEYS = ['assignedToIds', 'assignedTeamIds', 'statuses', 'excludeStatuses', 'priorities'] as const;

/** Shared by GET /api/cases and GET /api/cases/count — both forward the exact same filter set to their respective upstream endpoints (see backend's case-query.util.ts header comment on why the two stayed separate endpoints). Not a route.ts export: Next.js's typed-routes checker only allows HTTP-method exports (+ a few config ones) from a route.ts file. */
export function buildCaseFilterQueryString(searchParams: URLSearchParams): string {
  const qs = new URLSearchParams();
  for (const key of SCALAR_FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value) qs.set(key, value);
  }
  for (const key of ARRAY_FILTER_KEYS) {
    for (const value of searchParams.getAll(key)) qs.append(key, value);
  }
  return qs.toString();
}
