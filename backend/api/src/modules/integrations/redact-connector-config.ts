/** Masks secret-shaped keys anywhere in a connector's `config` JSON before
 * it's ever echoed back in an API response — matches the SCIM-token
 * pattern of "the real secret is only ever returned once, at creation"
 * (here: never returned at all after write, since config can be updated
 * without re-reading it first). Recurses into nested objects (e.g.
 * `config.oauth.clientSecret`). */
const SENSITIVE_KEY_PATTERN = /secret|apikey|password|token|webhookurl/i;

/** Recursive merge (not just top-level) for the same reason
 * redactConnectorConfig recurses: nested config shapes like
 * `{ seamlessHR: { apiBaseUrl, apiKey } }` need `apiKey` preserved even
 * when only `apiBaseUrl` was resent — a shallow `{...a, ...b}` merge would
 * replace the whole `seamlessHR` object and drop it. */
export function deepMergeConfig(base: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return patch;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    out[key] = deepMergeConfig((base as Record<string, unknown>)[key], value);
  }
  return out;
}

export function redactConnectorConfig(config: unknown): unknown {
  if (config === null || typeof config !== 'object') return config;
  if (Array.isArray(config)) return config.map(redactConnectorConfig);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = typeof value === 'string' && value.length > 0 ? '••••••••' : value;
    } else if (value && typeof value === 'object') {
      out[key] = redactConnectorConfig(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
