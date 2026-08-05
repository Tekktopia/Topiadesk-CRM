import { createHmac } from 'node:crypto';

/**
 * Stripe/GitHub convention: sign `timestamp.rawBody`, not the raw body
 * alone — binds the signature to a specific moment so a captured request
 * can't be replayed indefinitely; the receiving end is expected to reject
 * a signature whose timestamp is too old (their choice how old is "too
 * old" — this side just always includes it).
 */
export function signWebhookPayload(secret: string, rawBody: string, timestampSeconds: number): string {
  const signature = createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex');
  return `t=${timestampSeconds},v1=${signature}`;
}
