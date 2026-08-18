// Mirrors the Dockerfile's own vendoring pattern
// (backend/api/Dockerfile's `RUN node -e "..."` step), but points directly
// at the freshly-exported LOCAL onnx directory instead of a HuggingFace
// repo id — a cheap (minutes), high-value gate that catches a
// conversion-format mismatch before spending time on any Docker rebuild.
//
// Usage (from training/export/): node sanity_check.mjs
//
// Uses @huggingface/transformers from backend/api's own node_modules
// (already a real dependency there — see local-llm.service.ts) rather
// than requiring a separate install here.

import { pipeline } from '../../backend/api/node_modules/@huggingface/transformers/dist/transformers.node.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ONNX_DIR = join(__dirname, '..', 'output', 'onnx');

async function main() {
  console.log(`Loading local export from ${ONNX_DIR} (local_files_only, no network)...`);
  const start = Date.now();
  const generator = await pipeline('text-generation', ONNX_DIR, {
    dtype: 'q8',
    local_files_only: true,
  });
  console.log(`Loaded in ${Date.now() - start}ms`);

  // Same single-turn shape chat-intent-router.ts's answerKbHelp() used to
  // send — the exact input distribution this model was trained on.
  const messages = [
    {
      role: 'system',
      content:
        "You are the TopiaDesk CRM assistant, talking to an insurance broker or account handler inside their own CRM. Be warm, direct, and concise (2-4 sentences). You have NO access to this specific tenant's live data at this point in the conversation — never invent a specific account name, policy number, amount, or figure. If the question depends on real data, say so plainly and suggest the user name a specific account, or ask about their pipeline, win rate, renewals, or policy count, which this assistant CAN look up directly. Otherwise, just answer helpfully from general knowledge about how an insurance brokerage CRM works.",
    },
    { role: 'user', content: 'how do I file a claim' },
  ];

  const genStart = Date.now();
  const output = await generator(messages, { max_new_tokens: 100, do_sample: false });
  console.log(`Generation took ${Date.now() - genStart}ms`);

  const single = Array.isArray(output) ? output[0] : output;
  const lastTurn = single.generated_text.at(-1);
  console.log('\n--- Sample reply ---');
  console.log(lastTurn.content.trim());
  console.log('---------------------\n');
  console.log('If this loaded without a network fetch and the reply looks coherent and on-topic,');
  console.log('the export format is compatible — safe to proceed to Docker wiring.');
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
