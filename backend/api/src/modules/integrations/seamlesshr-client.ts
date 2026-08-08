/**
 * Isolated SeamlessHR API client — kept separate from the sync/upsert
 * logic in seamlesshr-sync.ts specifically so it's a small, single seam to
 * adjust once tested against SeamlessHR's real API. Built assuming a
 * typical Bearer-API-key REST shape (SeamlessHR's exact auth mechanism and
 * response envelope weren't available to verify against in this
 * environment) — this is the one piece most likely to need a fix once a
 * real SeamlessHR tenant/credentials are available to test with.
 */

export interface SeamlessHrEmployee {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Department/team name, if the tenant's SeamlessHR account tracks one. */
  department?: string;
  /** Office/branch name, if tracked. */
  branch?: string;
  employmentStatus?: string;
}

interface SeamlessHrListResponse {
  data: SeamlessHrEmployee[];
  meta?: { nextPage?: number | null };
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50; // hard ceiling — 5,000 employees — avoids an unbounded loop on an unexpected API shape.

export async function listSeamlessHrEmployees(apiBaseUrl: string, apiKey: string): Promise<SeamlessHrEmployee[]> {
  const employees: SeamlessHrEmployee[] = [];
  let page = 1;

  for (let i = 0; i < MAX_PAGES; i++) {
    const url = `${apiBaseUrl.replace(/\/$/, '')}/employees?page=${page}&per_page=${PAGE_SIZE}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`SeamlessHR list-employees failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 500)}`);
    }
    const body = (await res.json()) as SeamlessHrListResponse;
    employees.push(...body.data);
    if (!body.meta?.nextPage || body.data.length < PAGE_SIZE) break;
    page = body.meta.nextPage;
  }

  return employees;
}
