/**
 * Isolated SeamlessHR API client — kept separate from the sync/upsert
 * logic in seamlesshr-sync.ts specifically so it's a small, single seam to
 * adjust once tested against SeamlessHR's real API. Built assuming a
 * typical Bearer-API-key REST shape (SeamlessHR's exact auth mechanism and
 * response envelope weren't available to verify against in this
 * environment) — this is the one piece most likely to need a fix once a
 * real SeamlessHR tenant/credentials are available to test with.
 *
 * Hardened (security-audit follow-up) against the failure modes that
 * don't depend on knowing SeamlessHR's exact real shape — a slow/stalled
 * response, a transient 5xx/429, a response envelope that's missing the
 * field this code assumes — rather than guessing at API specifics that
 * still can't be verified without a real tenant.
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
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES_PER_PAGE = 3;
const RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries a transient failure (429/5xx/network error/timeout) with exponential backoff; a 4xx other than 429 fails immediately — retrying an auth/validation error just wastes the same attempts on the same wrong request. */
async function fetchPageWithRetry(url: string, apiKey: string): Promise<SeamlessHrListResponse> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES_PER_PAGE; attempt++) {
    if (attempt > 0) await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`SeamlessHR list-employees failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 500)}`);
        continue; // transient — retry
      }
      if (!res.ok) {
        throw new Error(`SeamlessHR list-employees failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 500)}`);
      }

      const body = (await res.json().catch(() => null)) as SeamlessHrListResponse | null;
      if (!body || !Array.isArray(body.data)) {
        // A shape mismatch, not a transport failure — retrying the same
        // request would just get the same wrong shape back. Surface it
        // clearly instead of a downstream "Cannot read properties of
        // undefined" from `body.data.push`.
        throw new Error(
          `SeamlessHR list-employees returned an unexpected response shape (expected { data: [...] }) — got: ${JSON.stringify(body).slice(0, 300)}`,
        );
      }
      return body;
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        lastError = new Error(`SeamlessHR list-employees timed out after ${REQUEST_TIMEOUT_MS}ms`);
        continue; // transient — retry
      }
      throw err; // shape mismatch or a non-retryable HTTP error — fail now
    }
  }

  throw lastError ?? new Error('SeamlessHR list-employees failed after retries for an unknown reason');
}

export async function listSeamlessHrEmployees(apiBaseUrl: string, apiKey: string): Promise<SeamlessHrEmployee[]> {
  const employees: SeamlessHrEmployee[] = [];
  let page = 1;

  for (let i = 0; i < MAX_PAGES; i++) {
    const url = `${apiBaseUrl.replace(/\/$/, '')}/employees?page=${page}&per_page=${PAGE_SIZE}`;
    const body = await fetchPageWithRetry(url, apiKey);
    employees.push(...body.data);
    if (!body.meta?.nextPage || body.data.length < PAGE_SIZE) break;
    page = body.meta.nextPage;
  }

  return employees;
}
