import type { NextRequest } from 'next/server';
import { proxy } from '../_lib/proxy';

export const runtime = 'nodejs';

/** GET /api/admin/permissions — the full seed-managed resource/action/scope
 * grid (read-only; grants happen on a Role via /api/admin/roles/:id/permissions). */
export async function GET(request: NextRequest) {
  return proxy(`/identity/permissions${request.nextUrl.search}`);
}
