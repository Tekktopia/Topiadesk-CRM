import { NextResponse } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';
import type { LookupOption } from '@/app/(policy)/lib/types';

export const runtime = 'nodejs';

interface AccountRow {
  id: string;
  name: string;
}
interface CarrierRow {
  id: string;
  name: string;
}
interface PolicyRow {
  id: string;
  policyNumber: string;
}

/**
 * GET /api/policy-lookups — id/name lookups for the Policies filter bar
 * (account picker) and for resolving `accountId`/`carrierId` on a policy
 * row into a human-readable name in the list/detail views. Combines
 * upstream calls (GET /crm/accounts, GET /crm/carriers, GET /policies —
 * reading another module's API, not its frontend, which the build brief
 * explicitly allows) into one same-origin round trip rather than exposing
 * either endpoint directly, and trims each response down to `{id, name}`
 * since that's all this feature area needs.
 *
 * `policies` was added by the Case Management batch (see
 * app/(cases)/claims's "New claim" dialog, which needs a policyId select)
 * — extended rather than duplicated per that module's build brief, additive
 * only so every existing `accounts`/`carriers` consumer is unaffected.
 */
export async function GET(): Promise<NextResponse<{ accounts: LookupOption[]; carriers: LookupOption[]; policies: LookupOption[] }>> {
  try {
    const [accountsRes, carriersRes, policiesRes] = await Promise.all([
      fetchApi('/crm/accounts?take=200'),
      fetchApi('/crm/carriers'),
      fetchApi('/policies'),
    ]);
    const accounts: LookupOption[] = accountsRes.ok ? ((await accountsRes.json()) as AccountRow[]).map((a) => ({ id: a.id, name: a.name })) : [];
    const carriers: LookupOption[] = carriersRes.ok ? ((await carriersRes.json()) as CarrierRow[]).map((c) => ({ id: c.id, name: c.name })) : [];
    const policies: LookupOption[] = policiesRes.ok
      ? ((await policiesRes.json()) as PolicyRow[]).map((p) => ({ id: p.id, name: p.policyNumber }))
      : [];
    return NextResponse.json({ accounts, carriers, policies });
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) {
      return NextResponse.json({ accounts: [], carriers: [], policies: [] }, { status: 401 });
    }
    console.error('[policy-lookups] failed', err);
    return NextResponse.json({ accounts: [], carriers: [], policies: [] }, { status: 200 });
  }
}
