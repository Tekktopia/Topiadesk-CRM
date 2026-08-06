import { createHash, randomBytes } from 'node:crypto';

/**
 * Portal login/session tokens are stored HASHED at rest (unlike
 * SurveyResponse.respondToken, which stores the raw value and compares
 * with crypto.timingSafeEqual) — a deliberate step up for tokens that
 * function like a password/API key (a PortalSession lives ~7 days, not a
 * single-use short-lived link), so a DB read alone can never replay one.
 * No timingSafeEqual needed on the lookup side: this is an exact-match
 * unique-index lookup by hash, not an in-memory string comparison, so the
 * length/prefix side-channel that guard exists for doesn't apply here.
 */
export function generatePortalToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashPortalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
