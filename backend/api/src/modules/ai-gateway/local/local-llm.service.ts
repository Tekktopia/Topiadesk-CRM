import { existsSync } from 'node:fs';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers';

/**
 * CURRENTLY UNREGISTERED — not in AiGatewayModule's `providers` array, so
 * NestJS never instantiates or loads this at boot, and nothing calls
 * `generate()`. The generic pretrained model this served
 * (Qwen2.5-1.5B-Instruct) was reported live as making the system slow;
 * chat-intent-router.ts's `answerKbHelp()` reverted to a two-tier
 * fallback that ends at an honest static message instead. This file is
 * kept intact, unchanged, specifically as the serving harness for Track 2
 * of the approved plan (distributed-kindling-cupcake.md) — a smaller,
 * domain-fine-tuned replacement, once trained/exported/evaluated as
 * actually better, is meant to slot in here by changing MODEL_ID/dtype
 * below and re-adding this service to AiGatewayModule's providers — see
 * that plan for the full pipeline. `getGenerator()`'s logic below is
 * already model-agnostic (driven entirely by MODEL_ID/existsSync), so no
 * other change should be needed here to swap models.
 *
 * In-process, fully local generative model — the ONLY generative (as
 * opposed to embedding/rule-based) piece of the AI Gateway. Used
 * exclusively as chat-intent-router.ts's LAST-RESORT conversational
 * fallback (see that file) — never for picking report types, building
 * filter objects, or anything else where a wrong/hallucinated answer would
 * actually matter. Small instruct models at this size are not reliable at
 * structured/JSON output (confirmed via research before choosing this
 * architecture — no constrained-decoding support exists in this stack
 * either), so every other AI Gateway feature stays rule-based/embedding-
 * based on purpose, not as a stopgap.
 *
 * Same vendoring/loading pattern as LocalEmbeddingsService: weights
 * baked into the Docker image at build time (backend/api/Dockerfile),
 * `local_files_only: true` so this is architecturally incapable of a
 * runtime network call, loaded once at boot and kept warm.
 *
 * Whether to use the vendored cache is decided by MODEL_CACHE_DIR
 * actually existing on disk, NOT `NODE_ENV === 'production'` — see
 * local-embeddings.service.ts's header comment for the full story: this
 * repo's docker-compose passes `NODE_ENV=development` straight through
 * from the root `.env`, silently overriding the Dockerfile's own `ENV
 * NODE_ENV=production` at container start. Confirmed live: this made the
 * real running container skip `local_files_only` on every boot and
 * attempt a genuine network fetch of this ~1.5GB model from
 * huggingface.co instead of using the copy already vendored on disk —
 * usually just slow, but a hard crash-loop (`ENOTFOUND huggingface.co`)
 * whenever that network call failed.
 *
 * Model: onnx-community/Qwen2.5-1.5B-Instruct, q8 quantized. The smaller
 * 0.5B-Instruct sibling was tried first (and is much cheaper to run), but
 * live testing in this container showed it genuinely incoherent —
 * off-topic, rambling replies even with repetition_penalty/
 * no_repeat_ngram_size tuning (e.g. asked "what can you help me with?" in
 * a CRM context, it free-associated into unrelated C code). Swapping to
 * 1.5B (same dtype, same loading code) produced coherent, accurate,
 * on-topic replies with no prompt/decoding changes — the quality jump was
 * decisive, not marginal. See the completion memory for the actual
 * measured numbers/examples of both.
 *
 * dtype is 'q8', NOT 'q4f16': verified empirically (throwaway containers)
 * that this model family's q4f16 export crashes onnxruntime-node 1.24.3 at
 * session-init with a real graph-fusion bug (SimplifiedLayerNormFusion
 * referencing a missing InsertedPrecisionFreeCast node) — q4/int8/uint8/q8
 * all load fine; q8 is transformers.js's standard, best-tested
 * quantization for text-generation.
 *
 * Needs real memory headroom to load reliably — confirmed empirically that
 * it SIGKILLs (OOM) under a ~7.7GB total Docker Desktop VM allocation
 * shared across this stack's ~14 containers; reliable once raised to
 * ~11.7GB. Any deployment target for this image needs equivalent headroom
 * available, not just this dev machine.
 */
const MODEL_ID = 'onnx-community/Qwen2.5-1.5B-Instruct';
const MODEL_CACHE_DIR = '/app/.model-cache'; // must match the Dockerfile's vendoring step and local-embeddings.service.ts's own constant.

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class LocalLlmService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LocalLlmService.name);
  private generatorPromise: Promise<TextGenerationPipeline> | null = null;

  async onApplicationBootstrap(): Promise<void> {
    const generator = await this.getGenerator();
    // The first real generate() call pays a one-time cost way beyond model
    // loading — measured live, ~278s on this hardware — from onnxruntime
    // compiling/warming its execution graph and allocating KV-cache buffers
    // on first use; every call after that on the same warm process is
    // sub-second. Without this, that entire cost lands on whichever real
    // user's message is first to reach the LLM fallback after a boot; a
    // trivial dummy generation here pays it once, at boot, while nobody's
    // waiting. Errors are logged but not fatal — a failed warm-up just
    // means the FIRST real request pays the cost instead, not a broken
    // service.
    const warmupStart = Date.now();
    try {
      await generator([{ role: 'user', content: 'hi' }], { max_new_tokens: 1, do_sample: false });
      this.logger.log(`Local LLM warm-up generation completed in ${Date.now() - warmupStart}ms`);
    } catch (err) {
      this.logger.warn(`Local LLM warm-up generation failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private getGenerator(): Promise<TextGenerationPipeline> {
    if (!this.generatorPromise) {
      const start = Date.now();
      const hasVendoredWeights = existsSync(MODEL_CACHE_DIR);
      this.generatorPromise = pipeline('text-generation', MODEL_ID, {
        dtype: 'q8',
        ...(hasVendoredWeights ? { cache_dir: MODEL_CACHE_DIR, local_files_only: true } : {}),
      }).then((generator) => {
        this.logger.log(`Local LLM (${MODEL_ID}) loaded in ${Date.now() - start}ms`);
        return generator;
      });
      this.generatorPromise.catch((err: unknown) => {
        this.logger.error(`Failed to load local LLM: ${err instanceof Error ? err.message : String(err)}`);
        this.generatorPromise = null;
      });
    }
    return this.generatorPromise;
  }

  /** `maxNewTokens` capped at a few hundred deliberately — this is a chat reply, not an essay, and every extra token is real CPU time on a synchronous request. */
  async generate(messages: LlmMessage[], maxNewTokens = 220): Promise<string> {
    const generator = await this.getGenerator();
    const output = await generator(messages, { max_new_tokens: maxNewTokens, do_sample: false });
    // Chat input -> chat output (see this package's own docs example): the
    // result is one TextGenerationSingleChat whose `generated_text` is the
    // FULL conversation (system+user+assistant) — the newly-generated
    // assistant turn is always the last entry.
    const single = Array.isArray(output) ? output[0] : output;
    const generatedText = single && 'generated_text' in single ? single.generated_text : undefined;
    if (!generatedText || typeof generatedText === 'string') {
      throw new Error('Local LLM returned an unexpected output shape');
    }
    const lastTurn = generatedText.at(-1);
    return typeof lastTurn?.content === 'string' ? lastTurn.content.trim() : '';
  }
}
