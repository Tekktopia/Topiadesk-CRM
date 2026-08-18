import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyJson } from '../_lib/proxy';

export const runtime = 'nodejs';

/**
 * GET /api/renewals — the org-wide renewal book (see
 * backend/api/src/modules/policy/renewal-board.controller.ts).
 *
 * Forwards the whole query string rather than hand-picking params. An
 * allowlist that falls behind the DTO drops filters SILENTLY — the request
 * still succeeds and quietly returns the unfiltered book, which on a
 * retention board would read as "nothing is at risk". That exact failure has
 * already happened five times in this codebase.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyJson(`/renewals${request.nextUrl.search}`);
}
