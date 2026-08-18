/**
 * Stage 6 (go/no-go) evaluation — standalone script, NOT wired into
 * turbo.json/CI/the normal test suite (a deliberate, narrow exception to
 * training/'s separation from the TS toolchain: this needs the real
 * `@huggingface/transformers` pipeline loading code already proven to work
 * in this exact runtime, which only exists on the TS side). See the
 * approved plan (distributed-kindling-cupcake.md, Track 2, Stage 6) for
 * the full context.
 *
 * Runs training/eval/eval-question-set.json's fixed questions through up
 * to three configs and prints answer + latency for each, for hand-scoring:
 *   1. OLD generic model (onnx-community/Qwen2.5-1.5B-Instruct) — network-
 *      fetched, since Track 1 removed it from the vendored image; skip with
 *      --skip-old if not wanted.
 *   2. NEW fine-tuned model — local path from training/output/onnx/,
 *      loaded with local_files_only (matching real serving behavior).
 *   3. The plain static FALLBACK_MESSAGE baseline (trivial, always run) —
 *      the real thing the new model is actually competing against, per the
 *      approved plan's go/no-go criteria.
 *
 * Run via: docker exec against the real built api container (see the
 * approved plan) for realistic quantized-ONNX-in-container latency
 * numbers, not a meaningless bare-Python/bare-host-Node number. Copy this
 * file + training/eval/eval-question-set.json into the container first
 * (same docker cp pattern used throughout this session's diagnostics), or
 * run on the host if @huggingface/transformers + a CPU capable of loading
 * both models is available there too.
 *
 * Usage:
 *   node -r <tsx-path>/dist/cjs/index.cjs eval-local-llm.ts [--skip-old] [--new-model-path <path>]
 */
import { pipeline } from '@huggingface/transformers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const OLD_MODEL_ID = 'onnx-community/Qwen2.5-1.5B-Instruct';
const DEFAULT_NEW_MODEL_PATH = join(__dirname, '..', '..', '..', 'training', 'output', 'onnx');
const QUESTION_SET_PATH = join(__dirname, '..', '..', '..', 'training', 'eval', 'eval-question-set.json');

// Copied verbatim from chat-intent-router.ts's own comment — the exact
// system prompt serving actually sent when this tier was live, and what
// training data was formatted against (see data/prepare_data.py).
const SYSTEM_PROMPT =
  "You are the TopiaDesk CRM assistant, talking to an insurance broker or account handler inside their own CRM. " +
  'Be warm, direct, and concise (2-4 sentences). You have NO access to this specific tenant\'s live data at this point ' +
  'in the conversation — never invent a specific account name, policy number, amount, or figure. If the question ' +
  'depends on real data, say so plainly and suggest the user name a specific account, or ask about their pipeline, ' +
  'win rate, renewals, or policy count, which this assistant CAN look up directly. Otherwise, just answer helpfully ' +
  'from general knowledge about how an insurance brokerage CRM works.';

const FALLBACK_MESSAGE =
  "I couldn't find a specific answer to that. I can look up accounts, contacts, opportunities, leads, campaigns, policies and cases (by name or number), your pipeline and win rate, renewals due, or answer how-do-I questions about TopiaDesk — try naming what you're looking for, pasting a policy/case number, or ask \"what can you help me with\" to see everything I can do.";

interface QuestionSet {
  inDomainRephrased: string[];
  smallTalk: string[];
  outOfScope: string[];
}

async function loadPipeline(modelId: string, opts: { localFilesOnly: boolean }) {
  return pipeline('text-generation', modelId, {
    dtype: 'q8',
    ...(opts.localFilesOnly ? { local_files_only: true } : {}),
  });
}

async function ask(generator: Awaited<ReturnType<typeof loadPipeline>>, question: string): Promise<{ answer: string; ms: number }> {
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: question },
  ];
  const start = Date.now();
  const output = await generator(messages, { max_new_tokens: 150, do_sample: false });
  const ms = Date.now() - start;
  const single = Array.isArray(output) ? output[0] : output;
  const generatedText = single && 'generated_text' in single ? single.generated_text : undefined;
  const lastTurn = typeof generatedText !== 'string' ? generatedText?.at(-1) : undefined;
  return { answer: typeof lastTurn?.content === 'string' ? lastTurn.content.trim() : '(unexpected output shape)', ms };
}

async function main() {
  const args = process.argv.slice(2);
  const skipOld = args.includes('--skip-old');
  const newModelPathArg = args.indexOf('--new-model-path');
  const newModelPath = newModelPathArg >= 0 ? args[newModelPathArg + 1]! : DEFAULT_NEW_MODEL_PATH;

  const questionSet = JSON.parse(readFileSync(QUESTION_SET_PATH, 'utf-8')) as QuestionSet;
  const allQuestions = [
    ...questionSet.inDomainRephrased.map((q) => ({ category: 'inDomainRephrased', q })),
    ...questionSet.smallTalk.map((q) => ({ category: 'smallTalk', q })),
    ...questionSet.outOfScope.map((q) => ({ category: 'outOfScope', q })),
  ];

  console.log(`Loaded ${allQuestions.length} eval questions.\n`);
  console.log('=== Baseline: FALLBACK_MESSAGE (0ms, always the same text) ===');
  console.log(FALLBACK_MESSAGE);
  console.log();

  let oldGenerator: Awaited<ReturnType<typeof loadPipeline>> | undefined;
  if (!skipOld) {
    console.log(`Loading OLD model ${OLD_MODEL_ID} (network fetch, no longer vendored)...`);
    try {
      oldGenerator = await loadPipeline(OLD_MODEL_ID, { localFilesOnly: false });
      console.log('OLD model loaded.\n');
    } catch (err) {
      console.error(`Could not load OLD model (skipping): ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  console.log(`Loading NEW model from ${newModelPath} (local_files_only)...`);
  let newGenerator: Awaited<ReturnType<typeof loadPipeline>> | undefined;
  try {
    newGenerator = await loadPipeline(newModelPath, { localFilesOnly: true });
    console.log('NEW model loaded.\n');
  } catch (err) {
    console.error(`Could not load NEW model: ${err instanceof Error ? err.message : String(err)}`);
    console.error('Run training/export/merge_lora.py + convert_to_onnx.sh first.');
    process.exit(1);
  }

  for (const { category, q } of allQuestions) {
    console.log('='.repeat(70));
    console.log(`[${category}] Q: ${q}`);
    if (oldGenerator) {
      const { answer, ms } = await ask(oldGenerator, q);
      console.log(`  OLD (${ms}ms): ${answer}`);
    }
    if (newGenerator) {
      const { answer, ms } = await ask(newGenerator, q);
      console.log(`  NEW (${ms}ms): ${answer}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Hand-score each NEW answer against: OLD (if present) and the FALLBACK_MESSAGE baseline.');
  console.log(
    'Go criteria (from the approved plan): NEW beats the fallback baseline on usefulness for most ' +
      'questions, is meaningfully faster than OLD, and does not fabricate specific account/policy/amount ' +
      'details on the outOfScope questions.',
  );
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
