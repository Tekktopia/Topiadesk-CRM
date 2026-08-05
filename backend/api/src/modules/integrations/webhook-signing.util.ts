import { randomBytes } from 'node:crypto';

/**
 * Generated once at subscription-creation time (webhook-subscriptions.
 * controller.ts) and shown to the caller exactly once — same shown-once
 * contract as ScimApiToken (identity/scim-token.util.ts), except this
 * secret IS stored in plaintext (WebhookSubscription.signingSecret), not
 * hashed: unlike a bearer token that authenticates INBOUND calls to us,
 * this secret is used OUTBOUND, to HMAC-sign deliveries WE send (see
 * backend/worker/src/jobs/webhooks/webhook-signing.util.ts) — the API
 * process needs the raw value on every dispatch, so hashing it here would
 * make it unusable for its actual purpose.
 */
export function generateWebhookSigningSecret(): string {
  return `whsec_${randomBytes(32).toString('hex')}`;
}
