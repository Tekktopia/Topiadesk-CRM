import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Twilio's own documented X-Twilio-Signature algorithm — full URL the
 * request was POSTed to (query string included) + every POST param's
 * key+value concatenated directly onto it, keys sorted lexicographically,
 * HMAC-SHA1 with the account's Auth Token, base64-encoded.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Shared by omnichannel-webhook.guard.ts (inbound WhatsApp/SMS-to-case)
 * and campaign-webhook.guard.ts (outbound SMS/WhatsApp delivery-status
 * callbacks) — both receive Twilio-shaped, form-encoded requests.
 *
 * Uses X-Forwarded-Proto/Host directly (Traefik sets both by default)
 * rather than Express's `trust proxy` + req.protocol, since nothing in
 * this app's bootstrap currently configures the latter — genuinely
 * deployment-topology-sensitive: re-verify against real Twilio traffic
 * before relying on this if fronted by something other than Traefik, or
 * if Traefik's default forwarded-header behavior ever changes. No live
 * Twilio account exists in this dev environment to verify end-to-end.
 */
export function verifyTwilioSignature(authToken: string, providedSignature: string, req: Request): boolean {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.get('host');
  const url = `${proto}://${host}${req.originalUrl}`;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const sortedParams = Object.keys(body)
    .sort()
    .map((key) => `${key}${String(body[key])}`)
    .join('');

  const expected = createHmac('sha1', authToken).update(url + sortedParams).digest('base64');
  const expectedBuf = Buffer.from(expected, 'base64');
  const providedBuf = Buffer.from(providedSignature, 'base64');
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}
