import { EncryptJWT, jwtDecrypt, type JWTPayload } from 'jose';

/**
 * Symmetric encryption for our two cookies (`td_session`, `td_oauth_txn`)
 * using `jose` (the standard, actively-maintained JOSE/JWT library — also
 * what NextAuth/Auth.js uses under the hood for its own session cookie).
 * `alg: dir` + `enc: A256GCM` (direct encryption, no key wrapping) keeps
 * this simple: one symmetric key, authenticated encryption, no separate
 * signing step needed since AES-GCM is AEAD.
 *
 * The key is derived from WEB_SESSION_SECRET via SHA-256 (Web Crypto,
 * available as a global in both the Node.js and Edge runtimes — this file
 * is imported from middleware.ts, which runs on the Edge runtime by
 * default, so it must not depend on `node:crypto`). WEB_SESSION_SECRET is
 * expected to already be a high-entropy 32-byte hex string per
 * .env.example's guidance ("generate 32-byte random hex"); hashing it just
 * normalizes arbitrary input length to exactly 32 bytes for A256GCM.
 */
async function deriveKey(secret: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

export async function encryptPayload(
  payload: JWTPayload,
  secret: string,
  maxAgeSeconds: number,
): Promise<string> {
  const key = await deriveKey(secret);
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSeconds)
    .encrypt(key);
}

/** Returns null (never throws) on a missing/tampered/expired cookie so
 * callers can uniformly treat that as "no session". */
export async function decryptPayload<T extends JWTPayload>(token: string, secret: string): Promise<T | null> {
  try {
    const key = await deriveKey(secret);
    const { payload } = await jwtDecrypt(token, key);
    return payload as T;
  } catch {
    return null;
  }
}
