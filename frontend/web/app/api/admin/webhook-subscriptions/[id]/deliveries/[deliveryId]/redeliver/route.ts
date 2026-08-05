import type { NextRequest } from 'next/server';
import { proxy } from '../../../../../_lib/proxy';

export const runtime = 'nodejs';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; deliveryId: string }> }) {
  const { id, deliveryId } = await params;
  return proxy(`/integrations/webhook-subscriptions/${id}/deliveries/${deliveryId}/redeliver`, { method: 'POST' });
}
