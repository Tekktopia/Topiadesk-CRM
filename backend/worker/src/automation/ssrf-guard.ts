import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Refuses outbound requests aimed at anything but a public internet host.
 *
 * Automation actions that call an admin-supplied URL (CALL_WEBHOOK,
 * NOTIFY_TEAMS_CHANNEL) run inside the worker, on the internal network,
 * holding whatever cloud role the host carries. Without this, an
 * "https://" check is the ONLY guard (pentest PT-M1): a malicious or
 * compromised admin can point the URL at an internal service, or at the
 * cloud instance-metadata endpoint 169.254.169.254 to steal credentials,
 * and the signed payload we POST doubles as an exfiltration channel.
 *
 * Two defences, because either alone is bypassable:
 *   1. Resolve the hostname and reject if ANY resolved address is private,
 *      loopback, link-local or otherwise reserved. Resolving (not just
 *      string-matching the host) is what stops `http://metadata.attacker
 *      .com` that resolves to 169.254.169.254, and DNS-rebinding tricks.
 *   2. The caller must use `redirect: 'manual'` and treat a 3xx as failure —
 *      otherwise a public URL can 30x onward to an internal one AFTER this
 *      check has passed.
 */

/** Reserved / non-public IPv4 ranges, as [network, maskBits]. */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this host"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — includes 169.254.169.254 metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved / broadcast
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const addr = ipv4ToInt(ip);
  if (addr === null) return true; // unparseable → treat as unsafe
  for (const [net, bits] of BLOCKED_V4) {
    const netInt = ipv4ToInt(net)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((addr & mask) === (netInt & mask)) return true;
  }
  return false;
}

function isBlockedV6(ip: string): boolean {
  const a = ip.toLowerCase();
  if (a === '::1' || a === '::') return true; // loopback / unspecified
  if (a.startsWith('fe80') || a.startsWith('fc') || a.startsWith('fd')) return true; // link-local / ULA
  // IPv4-mapped (::ffff:a.b.c.d) — unwrap and check the embedded v4.
  const mapped = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/u);
  if (mapped?.[1]) return isBlockedV4(mapped[1]);
  return false;
}

function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedV4(ip);
  if (kind === 6) return isBlockedV6(ip);
  return true; // not a recognisable IP → unsafe
}

/**
 * Throws unless `rawUrl` is an https URL whose host resolves exclusively to
 * public internet addresses. Call BEFORE fetching; pair with
 * `redirect: 'manual'` at the call site.
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Webhook URL is not a valid URL.');
  }
  if (url.protocol !== 'https:') throw new Error('Webhook URLs must use https.');

  // A literal IP host is checked directly; a name is resolved to every
  // address it maps to, and ALL must be public (one private answer is enough
  // to reject, defeating round-robin rebinding).
  const literal = isIP(url.hostname);
  const addresses = literal ? [url.hostname] : (await lookup(url.hostname, { all: true })).map((a) => a.address);
  if (addresses.length === 0) throw new Error(`Webhook host ${url.hostname} did not resolve.`);
  for (const addr of addresses) {
    if (isBlockedAddress(addr)) {
      throw new Error(`Webhook host ${url.hostname} resolves to a non-public address (${addr}) and is refused.`);
    }
  }
}

/** True when a fetch Response is a redirect the caller must not follow. */
export function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}
