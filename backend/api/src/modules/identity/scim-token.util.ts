import { createHash, randomBytes } from 'node:crypto';

const TOKEN_PREFIX = 'scim_';

/**
 * ScimApiToken.tokenHash stores a SHA-256 hex digest, not a slow
 * password-style hash (bcrypt/argon2) — this codebase has no bcrypt/argon2
 * dependency anywhere (checked: only `createHash('sha256')` shows up
 * already, for document checksums in documents.service.ts and the
 * deterministic-UUID trick in org-settings.controller.ts), and SHA-256 is
 * the right tool for a high-entropy random API token (32 bytes from
 * randomBytes below): unlike a human-chosen password, there's no
 * low-entropy guessing risk a slow hash defends against, so a fast
 * cryptographic hash used purely as a lookup key is standard practice for
 * this class of secret (same approach GitHub/Stripe use for API tokens).
 */
export function generateScimToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
}

export function hashScimToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
