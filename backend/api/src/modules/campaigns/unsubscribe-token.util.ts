import jwt from 'jsonwebtoken';
import { loadEnv } from '@topiadesk/config';
import type { CampaignChannel } from '@topiadesk/db';

/**
 * Signs/verifies the public unsubscribe link's token. Reuses
 * WEB_SESSION_SECRET (packages/config/src/env.ts) — already a required,
 * zod-validated HMAC secret with nothing else consuming it yet — rather
 * than adding a new env var, per the brief's "reuse whatever signing
 * mechanism is simplest and already available" instruction. jsonwebtoken is
 * already a backend/api dependency (see jwt-verifier.ts's RS256 use
 * against Keycloak's JWKS); this is a separate HS256 use of the same
 * library, not the same verification path.
 *
 * No `expiresIn`: an unsubscribe link is expected to keep working for as
 * long as the email that contains it might still be sitting in someone's
 * inbox — an expired unsubscribe link that silently stops working is worse
 * for NDPR compliance than a link that (correctly) never does.
 *
 * Duplicated in backend/worker/src/jobs/campaigns/unsubscribe-token.util.ts
 * (the worker signs tokens into outgoing campaign emails; this copy
 * verifies them here) — same no-shared-package-between-api-and-worker
 * reasoning as segment-filters.ts. Keep both copies in sync by hand.
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

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload {
  const env = loadEnv();
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, env.WEB_SESSION_SECRET, { issuer: UNSUBSCRIBE_TOKEN_ISSUER, algorithms: ['HS256'] });
  } catch {
    throw new Error('Invalid or tampered unsubscribe token');
  }
  if (typeof decoded === 'string' || !decoded.contactId || !decoded.channel || !decoded.emailOrPhone) {
    throw new Error('Malformed unsubscribe token');
  }
  return {
    contactId: decoded.contactId as string,
    channel: decoded.channel as CampaignChannel,
    emailOrPhone: decoded.emailOrPhone as string,
  };
}
