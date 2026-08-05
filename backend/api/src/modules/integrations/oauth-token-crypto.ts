import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { loadEnv } from '@topiadesk/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // GCM's standard/recommended IV length

/**
 * App-layer AES-256-GCM for IntegrationOAuthCredential's stored access/
 * refresh tokens — see that model's schema.prisma doc comment for why this
 * is app-layer rather than routing through pgcrypto transparently: keeps
 * the encryption boundary explicit in application code, not implicit in
 * SQL. Output format `iv:authTag:ciphertext` (all hex) is self-contained —
 * no separate columns needed for iv/tag.
 */
function getKey(): Buffer {
  return Buffer.from(loadEnv().INTEGRATION_TOKEN_ENCRYPTION_KEY, 'hex');
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptToken(encrypted: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error('Malformed encrypted token value (expected iv:authTag:ciphertext)');
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
