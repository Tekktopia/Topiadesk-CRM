import { EncryptJWT, jwtDecrypt, type JWTPayload } from 'jose';

/**
 * Symmetric cookie encryption — verbatim copy of frontend/web/lib/auth/
 * crypto.ts's approach (jose, `dir`/`A256GCM`, key derived via SHA-256 from
 * a secret, keyed off GLOBAL_ADMIN_SESSION_SECRET here instead of
 * WEB_SESSION_SECRET). Web-Crypto-based so this also works from
 * middleware.ts's Edge runtime.
 */
async function deriveKey(secret: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

export async function encryptPayload(payload: JWTPayload, secret: string, maxAgeSeconds: number): Promise<string> {
  const key = await deriveKey(secret);
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSeconds)
    .encrypt(key);
}

export async function decryptPayload<T extends JWTPayload>(token: string, secret: string): Promise<T | null> {
  try {
    const key = await deriveKey(secret);
    const { payload } = await jwtDecrypt(token, key);
    return payload as T;
  } catch {
    return null;
  }
}
