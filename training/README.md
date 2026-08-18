# TopiaDesk local LLM — domain fine-tuning pipeline

Standalone Python project. **Not** a pnpm workspace member (`pnpm-workspace.yaml`'s globs are `backend/*`, `frontend/*`, `packages/*` — this directory falls outside all of them, so the TS toolchain/lint/typecheck/CI never touches it). Kept completely separate on purpose — see the approved plan at `.claude/plans/distributed-kindling-cupcake.md` (Track 2) for the full context and rationale.

## What this produces

A small, domain-fine-tuned replacement for the generic `Qwen2.5-1.5B-Instruct` model that used to serve as chat's conversational fallback (removed from production — see Track 1 of the same plan — because it was reported live as making the system slow). The output is a LoRA fine-tune of the smaller `Qwen2.5-0.5B-Instruct`, merged and exported to the same ONNX format the existing serving code (`backend/api/src/modules/ai-gateway/local/local-llm.service.ts`) already knows how to load — the goal is a model that's both faster (smaller base) and more on-topic (fine-tuned on TopiaDesk's own content) than the generic model was.

**This is a genuinely open question, not a guaranteed win.** `local-llm.service.ts`'s own header comment documents that the 0.5B model was tried once already and found incoherent at generic zero-shot use. The bet here is that fine-tuning narrows its job enough (recite/paraphrase a bounded set of TopiaDesk facts, stay on-topic, decline gracefully) to fix that — plausible, but unproven until Stage 6 (evaluation) actually measures it.

## Setup (Stage 0)

This machine's only installed Python is 3.14.6 (Homebrew), too new to trust for this ML stack (peft/trl/torch compatibility with 3.14 is unverified). Install 3.11 specifically for this project:

```sh
brew install python@3.11
cd training
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Verify the CPU build of torch actually installed (no CUDA):
```sh
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
# expect: cuda available = False (this machine has no GPU)
```

## Hardware reality (read before running anything)

This machine is an Intel Core i7-7820HQ (2017-era mobile quad-core, x86_64, no GPU, no Metal/MPS acceleration). Training — even efficient LoRA fine-tuning — is genuinely slow here: expect somewhere in a **2-8+ hour** range for a full run, not minutes. `train/lora_sft.py` has a `--measure-only` flag that runs 5-10 real steps and reports actual seconds/step on this machine before committing to a full run — always do this first rather than trusting a generic online benchmark, which won't reflect this specific old CPU.

Practical recommendations for the real run:
- Run via `nohup python train/lora_sft.py > train.log 2>&1 &` (or equivalent) so it survives a closed terminal.
- Use macOS `caffeinate -i` to prevent the laptop from sleeping mid-run: `caffeinate -i nohup python train/lora_sft.py ...`.
- Pause the rest of the Docker Compose stack (`docker compose stop`) during the run — frees real CPU/RAM this training job needs, and there's no reason to keep ~14 containers running while nobody's using the app.

## Pipeline stages

Run in order — each stage's output gates the next; don't skip ahead on a failure.

1. **Extract** (`data/extract/`): pull real TopiaDesk content — `export_app_help_corpus.py` (18 built-in Q&A pairs, regex-parsed from the TS source) and `export_kb_articles.py` (published `KnowledgeArticle` rows, direct read-only Postgres query — **dev database only, never point this at production**, it deliberately bypasses the app's own RLS layer).
2. **Augment + mix in + format** (`data/augment.py`, `data/external/fetch_general_instruct.py`, `data/prepare_data.py`): paraphrase the ~20 real facts into ~100 examples, mix in a few hundred rows of `databricks/databricks-dolly-15k` (Apache-2.0 — **never** swap in `HuggingFaceH4/no_robots` or similar CC-BY-NC data, this ships in a commercial product), format to Qwen's chat template, split train/val. Every example uses the exact `LLM_SYSTEM_PROMPT` text from `chat-intent-router.ts`'s comment (copied verbatim, kept in manual sync — no shared import path exists between this Python project and the TS app).
3. **Train** (`train/lora_sft.py`): LoRA fine-tune. Run `--measure-only` first.
4. **Export** (`export/`): merge LoRA into the base model, convert to ONNX (via transformers.js's own conversion tooling, not a bare `optimum-cli` call — see that stage's own notes), quantize to q8. Run `export/sanity_check.mjs` (plain Node, mirrors the Dockerfile's own vendoring pattern) before touching Docker at all.
5. **Evaluate** (`eval/` + `backend/api/scripts/eval-local-llm.ts`): score the new model against the old generic 1.5B and the plain fallback message on a fixed question set. This is the go/no-go gate — nothing gets wired back into production serving until this step gives a clear "yes, this is actually better."

## Training data provenance rule (non-negotiable)

Training data may **only** come from admin-authored product/process documentation (the app-help corpus, published knowledge articles) and the one external, permissively-licensed dataset named above. **Never** real tenant/customer data (accounts, contacts, policies, cases). Unlike a live, RLS-protected database read — which can be revoked or corrected instantly — anything baked into trained model weights can't be un-taught. `data/manifest.py` records exactly which KB article version IDs fed each training run, specifically so a later content correction/retraction can be traced to which model checkpoints still "know" the old version.
