import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';

export const runtime = 'nodejs';

interface PolicyRow {
  id: string;
  policyNumber: string;
  accountId: string;
  status: string;
  lineOfBusiness: string;
  expiryDate: string;
}
interface RenewalScheduleRow {
  policyId: string;
  renewalDueDate: string;
  status: string;
  assignedToId: string | null;
  renewalMeetingDate: string | null;
}
interface AccountRow {
  id: string;
  name: string;
}

export interface RenewalRow {
  policyId: string;
  policyNumber: string;
  accountId: string;
  accountName: string;
  lineOfBusiness: string;
  renewalDueDate: string;
  renewalStatus: string;
  policyStatus: string;
  assignedToId: string | null;
}

/**
 * GET /api/dashboard/renewals — the dashboard's renewal calendar/timeline
 * data source. backend/api has no bulk "renewals due soon" listing (each
 * RenewalSchedule is only reachable per-policy, via GET
 * /policies/:policyId/renewal-schedule — see renewal-schedule.controller.ts's
 * header comment: one row per policy, `@unique policyId`); per the build
 * brief this composes what IS available rather than inventing a new
 * backend endpoint: GET /policies (already ordered by expiryDate asc,
 * capped at 100 by the controller) fanned out into one renewal-schedule
 * lookup per policy, tolerating the 404 a policy with no schedule yet
 * returns, then joined against account names for display. `ownerId`/
 * `from`/`to` filter the already-fully-fetched result in-memory (by
 * `assignedToId` and `renewalDueDate`) rather than a new backend query —
 * this route already holds the complete joined dataset before any
 * filtering would apply.
 */
export async function GET(request: NextRequest): Promise<NextResponse<RenewalRow[]>> {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('ownerId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const policiesRes = await fetchApi('/policies');
    if (!policiesRes.ok) return NextResponse.json([], { status: 200 });
    const policies = (await policiesRes.json()) as PolicyRow[];
    // CANCELLED policies are terminal and never re-enter a renewal cycle —
    // skip fetching schedules for them to cut down the fan-out.
    const candidates = policies.filter((p) => p.status !== 'CANCELLED');

    const [scheduleResults, accountsRes] = await Promise.all([
      Promise.all(
        candidates.map(async (policy) => {
          const res = await fetchApi(`/policies/${policy.id}/renewal-schedule`);
          if (!res.ok) return null;
          return (await res.json()) as RenewalScheduleRow;
        }),
      ),
      fetchApi('/crm/accounts?take=200'),
    ]);

    const accounts: AccountRow[] = accountsRes.ok ? await accountsRes.json() : [];
    const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
    const policyById = new Map(candidates.map((p) => [p.id, p]));

    const rows: RenewalRow[] = scheduleResults
      .filter((s): s is RenewalScheduleRow => s !== null)
      .map((schedule) => {
        const policy = policyById.get(schedule.policyId)!;
        return {
          policyId: policy.id,
          policyNumber: policy.policyNumber,
          accountId: policy.accountId,
          accountName: accountNameById.get(policy.accountId) ?? 'Unknown account',
          lineOfBusiness: policy.lineOfBusiness,
          renewalDueDate: schedule.renewalDueDate as unknown as string,
          renewalStatus: schedule.status,
          policyStatus: policy.status,
          assignedToId: schedule.assignedToId,
        };
      })
      .filter((r) => !ownerId || r.assignedToId === ownerId)
      .filter((r) => !from || r.renewalDueDate >= from)
      .filter((r) => !to || r.renewalDueDate <= to)
      .sort((a, b) => new Date(a.renewalDueDate).getTime() - new Date(b.renewalDueDate).getTime());

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) return NextResponse.json([], { status: 401 });
    console.error('[dashboard/renewals] failed', err);
    return NextResponse.json([], { status: 200 });
  }
}
