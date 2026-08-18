import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { loadEnv } from './env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // GCM's standard/recommended IV length

/**
 * App-layer AES-256-GCM for secrets stored in the database — OAuth tokens,
 * SMTP passwords, anything the app must be able to read back but must never
 * hold in plaintext.
 *
 * Lives in `config` rather than in either app because BOTH need it: the api
 * writes these secrets and the worker reads them (it is the process that
 * actually sends mail). Duplicating the implementation across the two — the
 * usual convention for api/worker code in this repo — is unacceptable here
 * specifically: if the two copies ever drift, every previously stored secret
 * becomes undecryptable. The encryption key already lives in this package's
 * env schema, so the helper that consumes it belongs beside it.
 *
 * Output format `iv:authTag:ciphertext` (all hex) is self-contained — no
 * separate columns needed for iv/tag.
 */
function getKey(): Buffer {
  return Buffer.from(loadEnv().INTEGRATION_TOKEN_ENCRYPTION_KEY, 'hex');
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptSecret(encrypted: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted value (expected iv:authTag:ciphertext)');
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
