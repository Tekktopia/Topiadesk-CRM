import jwt from 'jsonwebtoken';
import { loadEnv } from '@topiadesk/config';
import type { CampaignChannel } from '@topiadesk/db';

/**
 * Signs the unsubscribe link's token at send time (embedded in every
 * outgoing campaign message — see dispatch.job.ts). Duplicated from
 * backend/api/src/modules/campaigns/unsubscribe-token.util.ts (which
 * verifies tokens on the public/unsubscribe route) — same no-shared-
 * package-between-api-and-worker reasoning as segment-filters.ts. Keep
 * both copies in sync by hand, including WEB_SESSION_SECRET reuse and the
 * no-`expiresIn` choice — see the api copy's header comment for the full
 * rationale.
 */
export interface UnsubscribeTokenPayload {
  contactId: string;
  channel: CampaignChannel;
  emailOrPhone: string;
}

const UNSUBSCRIBE_TOKEN_ISSUER = 'topiadesk-campaigns-unsubscribe';

export function signUnsubscribeToken(payload: UnsubscribeTokenPayload): string {
  const env = loadEnv();
  return jwt.sign(payload, env.WEB_SESSION_SECRET, { issuer: UNSUBSCRIBE_TOKEN_ISSUER, algorithm: 'HS256' });
}
