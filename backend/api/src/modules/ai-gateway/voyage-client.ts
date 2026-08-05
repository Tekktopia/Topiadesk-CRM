import { loadEnv } from '@topiadesk/config';

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

/**
 * Voyage AI's current general-purpose model. Chosen over the domain-specific
 * voyage-finance-2/voyage-law-2 (this is CRM notes/knowledge-article text,
 * not exclusively financial/legal documents) and over voyage-code-3 (no
 * code search here). $0.06/M tokens — see pricing.ts's
 * VOYAGE_PRICING_USD_PER_MILLION_TOKENS for the cited source and the
 * org-cap cost function.
 */
export const VOYAGE_MODEL = 'voyage-4';

/**
 * Voyage's `output_dimension` only offers 256/512/1024(default)/2048 — NOT
 * 1536, which is what SemanticEmbedding.embedding originally shipped as
 * (sized for OpenAI's default). 1024 is Voyage's own default and the
 * dimension packages/db/prisma/migrations/20260803010000_semantic_embedding_
 * voyage_dimension/migration.sql migrated the column to.
 */
export const VOYAGE_EMBEDDING_DIMENSION = 1024;

export interface VoyageEmbedResult {
  /** One embedding per input string, same order as the `input` array passed in. */
  embeddings: number[][];
  totalTokens: number;
}

interface VoyageEmbeddingsApiResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { total_tokens: number };
}

/**
 * Minimal fetch-based wrapper — Voyage AI has no official Node SDK (unlike
 * Anthropic's @anthropic-ai/sdk). Uses Node 20's global `fetch` rather than
 * adding a new HTTP client dependency — no axios/undici anywhere else in
 * this repo (see backend/api/package.json), and this is the one endpoint
 * this project calls.
 */
export class VoyageClient {
  constructor(private readonly apiKey: string) {}

  /**
   * `inputType` matters for retrieval quality (Voyage encodes queries and
   * documents slightly differently for asymmetric search) — 'document' for
   * /ai/index's indexing calls, 'query' for /ai/search's query embedding.
   */
  async embed(input: string[], inputType: 'query' | 'document'): Promise<VoyageEmbedResult> {
    const res = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input,
        model: VOYAGE_MODEL,
        input_type: inputType,
        output_dimension: VOYAGE_EMBEDDING_DIMENSION,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Voyage embeddings API request failed (${res.status}): ${body.slice(0, 500)}`);
    }

    const json = (await res.json()) as VoyageEmbeddingsApiResponse;
    // Voyage's response `data` is documented as index-ordered, but sorting
    // explicitly costs nothing and removes any dependency on that holding.
    const embeddings = [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return { embeddings, totalTokens: json.usage.total_tokens };
  }
}

let client: VoyageClient | undefined;

/**
 * Returns `null` (never throws) when VOYAGE_API_KEY isn't configured — same
 * lazy-client contract as getAnthropicClient(): callers must check for
 * `null` explicitly and fail the individual request cleanly (503) rather
 * than let API boot fail or a request throw an opaque error.
 */
export function getVoyageClient(): VoyageClient | null {
  const env = loadEnv();
  if (!env.VOYAGE_API_KEY) return null;
  if (!client) {
    client = new VoyageClient(env.VOYAGE_API_KEY);
  }
  return client;
}
