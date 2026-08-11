import type { NextRequest } from 'next/server';
import { proxyWithBody } from '../../../_lib/proxy';

export const runtime = 'nodejs';

/** POST /api/admin/integrations/whatsapp/test -> POST /integrations/whatsapp/test (IntegrationsController.testWhatsApp). */
export async function POST(request: NextRequest) {
  return proxyWithBody(request, '/integrations/whatsapp/test', 'POST');
}
