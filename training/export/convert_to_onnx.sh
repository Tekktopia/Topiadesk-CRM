#!/usr/bin/env bash
# Converts the merged model (../output/merged/) to ONNX, quantized to q8 —
# matching what local-llm.service.ts's pipeline() call already expects.
#
# NOTE: the approved plan originally called for transformers.js's OWN
# bundled Python conversion tooling (scripts/convert.py in that repo) —
# that script no longer exists in the current huggingface/transformers.js
# main branch (confirmed live: cloned the repo, `scripts/` only has JS dev
# tooling now — dev.mjs/logger.mjs/prepareOutDir.mjs/rebuildPlugin.mjs/
# reportSize.mjs, no Python at all). The repo's own current README now
# explicitly recommends the Optimum CLI directly ("Convert your models to
# ONNX" section) instead of a bundled script — this is the current,
# HF-endorsed path, not a workaround. `training/requirements.txt` already
# installs `optimum[exporters]`, which provides `optimum-cli`.
#
# Two real steps, not one, because `optimum-cli export onnx` alone only
# produces fp32 `model.onnx` — transformers.js's dtype:'q8' loader looks
# for a specifically-named `model_quantized.onnx` (confirmed live by
# reading @huggingface/transformers' own DEFAULT_DEVICE_DTYPE_MAPPING:
# q8 -> "_quantized" suffix) which only `optimum-cli onnxruntime quantize`
# produces:
#   1. optimum-cli export onnx        (PyTorch -> ONNX, KV-cache enabled)
#   2. optimum-cli onnxruntime quantize   (fp32 ONNX -> int8/q8 ONNX)
#
# --task text-generation-with-past: exports WITH KV-cache support (past key
# values), required for transformers.js's TextGenerationPipeline decoding
# loop — a plain `text-generation` export (no past) is prefill-only and
# incompatible with how local-llm.service.ts calls generate().
#
# --avx2 (not --avx512/--avx512_vnni): the safe, broadly-compatible choice
# for quantization target instruction set — AVX2 has been standard on
# x86_64 since ~2013, so this doesn't assume the eventual deployment host
# has anything newer than this dev machine (an AVX-512 build would be
# faster here but could fail to load on a deployment target without it).
#
# --model-kwargs '{"attn_implementation": "eager"}': NOT optional, found
# live via a real multi-hour debugging session, not a style preference.
# Without this, PyTorch's default SDPA (scaled_dot_product_attention)
# export path produces an ONNX graph that loads fine and validates fine in
# Python (both via plain onnxruntime and optimum's ORTModelForCausalLM —
# confirmed live, both gave correct, coherent answers) but produces
# garbled/off-topic output SPECIFICALLY when executed by
# @huggingface/transformers' JS-side generate() loop (onnxruntime-node) —
# confirmed live by bisecting against onnx-community's OWN official
# Qwen2.5-0.5B-Instruct export (same bug reproduces on the un-fine-tuned
# base model too, so this is not specific to this fine-tune) vs
# Qwen2.5-1.5B-Instruct (no bug, works fine — the 1.5B model already
# proven in production earlier this session). The distinguishing factor
# isn't fine-tuning OR model size in the abstract — the working 1.5B
# reference uses the SAME plain decomposed-ops ONNX graph style as the
# broken 0.5B one (confirmed by comparing op-level graphs directly), so
# it's specifically an SDPA-export-path numerical/structural issue that
# only manifests at 0.5B's head_dim=64 (vs 1.5B's head_dim=128) under
# transformers.js's specific JS-side KV-cache decode loop. A recurring
# `OnnxExporterWarning: Symbolic function 'aten::scaled_dot_product_attention'
# already registered for opset 14. Replacing the existing function...`
# warning during every default (non-eager) export was the tell. Forcing
# eager attention makes torch trace the OLD-STYLE manual
# matmul/mask/softmax/matmul attention instead of the fused SDPA op, and
# that graph executes correctly in transformers.js (confirmed live,
# multiple in-domain/small-talk/out-of-scope questions all came back as
# coherent English afterward — quality/accuracy of the ANSWERS themselves
# is a separate, legitimate Stage 6 eval question, not a pipeline bug).
# Tried first (before landing on this): optimum's own ORTOptimizer
# (`optimum-cli onnxruntime optimize`) explicitly does not support qwen2
# (raises NotImplementedError); onnxruntime's lower-level
# `onnxruntime.transformers.optimizer.optimize_model()` with model_type
# gpt_neox/phi/gpt2 fuses LayerNorm but never matches Qwen2's specific
# attention subgraph into MultiHeadAttention/RotaryEmbedding either way —
# neither produced a fix, both are dead ends for this architecture at the
# currently-installed onnxruntime/optimum versions, and are simpler to
# route around (eager export) than to keep chasing.
#
# Usage: ./convert_to_onnx.sh   (run from an activated training/venv)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MERGED_DIR="$SCRIPT_DIR/../output/merged"
RAW_ONNX_DIR="$SCRIPT_DIR/../output/onnx_raw"
QUANTIZED_DIR="$RAW_ONNX_DIR/quantized"
ONNX_OUTPUT_DIR="$SCRIPT_DIR/../output/onnx"

if [ ! -d "$MERGED_DIR" ]; then
  echo "ERROR: $MERGED_DIR not found — run merge_lora.py first." >&2
  exit 1
fi

if ! command -v optimum-cli >/dev/null 2>&1; then
  echo "ERROR: optimum-cli not found — activate training/venv (pip install -r requirements.txt)." >&2
  exit 1
fi

echo "Step 1/2: exporting $MERGED_DIR -> $RAW_ONNX_DIR (fp32, KV-cache enabled, eager attention)..." >&2
optimum-cli export onnx \
  --model "$MERGED_DIR" \
  --task text-generation-with-past \
  --model-kwargs '{"attn_implementation": "eager"}' \
  "$RAW_ONNX_DIR"

echo "Step 2/2: quantizing -> $QUANTIZED_DIR (int8, AVX2)..." >&2
optimum-cli onnxruntime quantize \
  --onnx_model "$RAW_ONNX_DIR" \
  --avx2 \
  -o "$QUANTIZED_DIR"

echo "Assembling final layout in $ONNX_OUTPUT_DIR (transformers.js expects config/tokenizer files at root, weights under onnx/)..." >&2
mkdir -p "$ONNX_OUTPUT_DIR/onnx"

# Config/tokenizer files: optimum-cli export onnx copies these to
# $RAW_ONNX_DIR's root alongside model.onnx.
find "$RAW_ONNX_DIR" -maxdepth 1 -type f \( -name "*.json" -o -name "*.txt" -o -name "*.jinja" \) -exec cp {} "$ONNX_OUTPUT_DIR/" \;

# fp32 weights (harmless to keep — only fetched if dtype:'fp32' is ever
# requested, which nothing in this codebase does today).
cp "$RAW_ONNX_DIR/model.onnx" "$ONNX_OUTPUT_DIR/onnx/model.onnx"
if [ -f "$RAW_ONNX_DIR/model.onnx_data" ]; then
  cp "$RAW_ONNX_DIR/model.onnx_data" "$ONNX_OUTPUT_DIR/onnx/model.onnx_data"
fi

# The actual file local-llm.service.ts's dtype:'q8' loads.
QUANTIZED_FILE=$(find "$QUANTIZED_DIR" -maxdepth 1 -name "*.onnx" | head -1)
if [ -z "$QUANTIZED_FILE" ]; then
  echo "ERROR: no quantized .onnx file found in $QUANTIZED_DIR" >&2
  exit 1
fi
cp "$QUANTIZED_FILE" "$ONNX_OUTPUT_DIR/onnx/model_quantized.onnx"

# optimum-cli export onnx writes the chat template as a STANDALONE
# chat_template.jinja file (the current HF convention) — but
# @huggingface/transformers' JS-side apply_chat_template() only reads
# tokenizer_config.json's own `chat_template` key, not that file (confirmed
# live: sanity_check.mjs failed with "tokenizer.chat_template is not set"
# even with chat_template.jinja sitting right next to it). Embed it.
python3 -c "
import json
with open('$ONNX_OUTPUT_DIR/tokenizer_config.json') as f:
    cfg = json.load(f)
with open('$ONNX_OUTPUT_DIR/chat_template.jinja') as f:
    cfg['chat_template'] = f.read()
with open('$ONNX_OUTPUT_DIR/tokenizer_config.json', 'w') as f:
    json.dump(cfg, f, indent=2)
"

echo "Done. ONNX output in $ONNX_OUTPUT_DIR" >&2
echo "Next: node sanity_check.mjs" >&2
