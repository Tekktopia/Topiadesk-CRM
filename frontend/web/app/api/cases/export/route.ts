import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { proxyStream } from '../../_lib/proxy';
import { buildCaseFilterQueryString } from '../_lib/filter-query';

export const runtime = 'nodejs';

/** GET /api/cases/export — CSV of the filtered set. Same filter translation as the list; proxyStream so the body and Content-Disposition survive intact. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const query = buildCaseFilterQueryString(searchParams);
  return proxyStream(`/cases/export${query ? `?${query}` : ''}`);
}
