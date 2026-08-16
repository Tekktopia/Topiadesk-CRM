import { existsSync } from 'node:fs';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

/**
 * In-process sentence-embedding model — the local, offline replacement for
 * voyage-client.ts. `all-MiniLM-L6-v2` (384-dim) is the standard, well-
 * documented default for this use case: small (~90MB), fast on CPU, and
 * symmetric (no query/document input-type split the way Voyage's asymmetric
 * encoding needed — `embed()` is used identically for both indexing and
 * searching here).
 *
 * Model weights are vendored into the Docker image at build time (see
 * backend/api/Dockerfile's `deps` stage, which runs this exact pipeline once
 * to populate MODEL_CACHE_DIR before any source code is even copied in) —
 * `local_files_only: true` makes this architecturally incapable of a
 * network call at runtime, not just "happens not to need one".
 *
 * Whether to use the vendored cache is decided by MODEL_CACHE_DIR actually
 * existing on disk, NOT `NODE_ENV === 'production'` (the original design,
 * silently broken in practice): this repo's docker-compose passes
 * `NODE_ENV` straight through from the root `.env` (`development` there),
 * which OVERRIDES the Dockerfile's own `ENV NODE_ENV=production` at
 * container start — so the real, running container was never actually
 * satisfying that check. Confirmed live: this made every container boot
 * silently skip `local_files_only` and instead attempt a REAL network
 * fetch from huggingface.co on every single restart (slow when it
 * happened to succeed, a hard crash-loop — `ENOTFOUND huggingface.co` —
 * when it didn't), despite the exact weights already sitting on disk at
 * MODEL_CACHE_DIR the whole time. Checking the directory's existence
 * instead answers the question this code actually cares about ("were
 * weights vendored into this filesystem at build time") directly, with no
 * dependency on which layer's NODE_ENV assumption wins.
 */
export const MODEL_ID = 'onnx-community/all-MiniLM-L6-v2-ONNX';
export const EMBEDDING_DIMENSION = 384;
// Must match the literal path the Dockerfile's model-vendoring RUN step
// writes to — see that file's comment. Deliberately a hardcoded constant,
// not a new env var, mirroring how VOYAGE_MODEL was a hardcoded constant
// rather than configurable.
const MODEL_CACHE_DIR = '/app/.model-cache';

@Injectable()
export class LocalEmbeddingsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LocalEmbeddingsService.name);
  private extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

  /** Loads the model at boot, not lazily on first request — the whole point of vendoring is no first-request latency spike. */
  async onApplicationBootstrap(): Promise<void> {
    await this.getExtractor();
  }

  private getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractorPromise) {
      const start = Date.now();
      const hasVendoredWeights = existsSync(MODEL_CACHE_DIR);
      this.extractorPromise = pipeline('feature-extraction', MODEL_ID, {
        dtype: 'fp32',
        ...(hasVendoredWeights ? { cache_dir: MODEL_CACHE_DIR, local_files_only: true } : {}),
      }).then((extractor) => {
        this.logger.log(`Local embedding model (${MODEL_ID}) loaded in ${Date.now() - start}ms`);
        return extractor;
      });
      this.extractorPromise.catch((err: unknown) => {
        this.logger.error(`Failed to load local embedding model: ${err instanceof Error ? err.message : String(err)}`);
        // Allow a later call to retry (e.g. a transient issue in dev) rather than permanently wedging this service on one failed attempt.
        this.extractorPromise = null;
      });
    }
    return this.extractorPromise;
  }

  /** Mean-pooled, L2-normalized embeddings — normalized so a plain dot product equals cosine similarity, matching how search()'s pgvector `<=>` cosine-distance query already assumes unit vectors. */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.getExtractor();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist() as number[][];
  }
}
