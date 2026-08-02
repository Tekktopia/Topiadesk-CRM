import { createHmac } from 'node:crypto';

/**
 * Minimal RFC 6238 TOTP generator — no dependency needed for a single call
 * site. Matches the realm's otpPolicy in infra/keycloak/realm-export.json
 * (HmacSHA1, 6 digits, 30s period), which is Keycloak's default anyway.
 *
 * Key encoding, which is easy to get wrong: Keycloak's CONFIGURE_TOTP page
 * renders the secret twice — the hidden `#totpSecret` input holds the RAW
 * secret string, while the QR code and the "Unable to scan?" manual-entry
 * panel show a Base32 *encoding* of that same string (TotpBean's
 * totpSecret vs totpSecretEncoded). Keycloak HMACs the raw bytes, so the
 * value read off `#totpSecret` must be used as-is — Base32-decoding it
 * produces a wrong key (and, since raw secrets routinely contain characters
 * outside the Base32 alphabet, usually an outright decode error).
 */
export function generateTotpCode(rawSecret: string, timestamp = Date.now(), period = 30, digits = 6): string {
  const key = Buffer.from(rawSecret, 'utf8');
  const counter = Math.floor(timestamp / 1000 / period);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, '0');
}
