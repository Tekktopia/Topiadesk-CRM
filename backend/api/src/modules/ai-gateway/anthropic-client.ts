import Anthropic from '@anthropic-ai/sdk';
import { loadEnv } from '@topiadesk/config';

let client: Anthropic | undefined;

/**
 * Returns `null` (never throws) when ANTHROPIC_API_KEY isn't configured —
 * ANTHROPIC_API_KEY is deliberately optional in packages/config/src/env.ts
 * so the API can boot without it in dev environments; callers must check
 * for `null` explicitly and fail the individual request cleanly (see
 * ai-gateway.service.ts) rather than letting `new Anthropic({apiKey: undefined})`
 * throw at call time with a less helpful error.
 */
export function getAnthropicClient(): Anthropic | null {
  const env = loadEnv();
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}
