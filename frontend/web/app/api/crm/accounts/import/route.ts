import type { NextRequest } from 'next/server';
import { forwardMultipart } from '../../_shared';

export const runtime = 'nodejs';

/** POST /api/crm/accounts/import — CSV bulk upsert-by-name. */
export async function POST(request: NextRequest) {
  return forwardMultipart(request, '/crm/accounts/import');
}
