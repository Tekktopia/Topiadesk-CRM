import { createHash, randomBytes } from 'node:crypto';

/**
 * Same SHA-256-hex-digest-as-lookup-key approach as backend/api's
 * api-key.util.ts — duplicated here (not imported) because backend/api and
 * backend/worker are separate deployable packages with no in-repo import
 * path between their src/ trees (see business-hours.util.ts's header
 * comment for the same constraint applied elsewhere). Both sides compute
 * the identical SHA-256 hash of the same raw token, so a token minted here
 * and later presented to backend/api's teams-actions.controller.ts
 * resolves to the same tokenHash regardless of which package computed it —
 * no shared secret or shared library needed for that to work.
 */
export function generateTeamsActionToken(): string {
  return randomBytes(24).toString('hex');
}

export function hashTeamsActionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
