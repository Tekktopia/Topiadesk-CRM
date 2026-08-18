import { decryptSecret, encryptSecret } from '@topiadesk/config';

/**
 * Thin re-export. The implementation moved to `packages/config` because the
 * WORKER also has to decrypt stored secrets (it sends the mail), and two
 * copies of the same AES-GCM code would eventually drift and make previously
 * stored secrets undecryptable.
 *
 * The original names are kept so every existing caller is unaffected.
 */
export const encryptToken = encryptSecret;
export const decryptToken = decryptSecret;
