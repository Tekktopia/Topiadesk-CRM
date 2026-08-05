import { NextResponse } from 'next/server';
import { ApiUnauthenticatedError, fetchApi } from '@/lib/api/server-fetch';
import type { TeamOption } from '@/app/(cases)/_lib/types';

export const runtime = 'nodejs';

/**
 * GET /api/identity-teams — best-effort id -> name directory, used to
 * render a real team picker (instead of a raw UUID paste field) on the
 * assignment rule form's "candidate pool team" select. GET /identity/teams
 * is gated on 'identity:read' (see teams.controller.ts), which not every
 * role holds — but only ADMIN holds 'sla_config:write' (required to even
 * open this create/edit dialog; see assignment-rules.controller.ts +
 * packages/db/prisma/seed.ts), and ADMIN already has 'identity:read:ALL'
 * from its full-resource grant, so this degrade-gracefully convention
 * (same as app/api/identity-users/route.ts) is defensive rather than a
 * known gap: swallow failures and return `[]` (200) rather than
 * propagating an error, so a stray 403 never breaks the rest of the form.
 */
export async function GET(): Promise<NextResponse<TeamOption[]>> {
  try {
    const res = await fetchApi('/identity/teams');
    if (!res.ok) return NextResponse.json([], { status: 200 });
    const teams = (await res.json()) as Array<{ id: string; name: string }>;
    return NextResponse.json(teams.map((t) => ({ id: t.id, name: t.name })));
  } catch (err) {
    if (err instanceof ApiUnauthenticatedError) return NextResponse.json([], { status: 200 });
    console.error('[identity-teams] failed', err);
    return NextResponse.json([], { status: 200 });
  }
}
