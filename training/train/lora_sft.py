"""LoRA supervised fine-tuning entrypoint.

ALWAYS run with --measure-only first — see README.md's "Hardware reality"
section. This machine (Intel i7-7820HQ, no GPU) has no reliable public
benchmark to extrapolate from; this flag runs a handful of real steps and
reports actual seconds/step so a full run's wall-clock time is a measured
estimate, not a guess.

Usage:
  python lora_sft.py --measure-only          # 5-10 steps, report timing, exit
  python lora_sft.py                          # full run (see README for
                                                # nohup/caffeinate recommendations)

Requires training/output/data/{train,val}.jsonl to already exist — run
data/prepare_data.py first.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lora_config import DEFAULT_CONFIG, LoraSftConfig  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[1] / "output" / "data"
CHECKPOINT_DIR = Path(__file__).resolve().parents[1] / "output" / "checkpoints"


def load_model_and_tokenizer(config: LoraSftConfig):
    import torch
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer

    print(f"Loading base model {config.base_model_id} (this can take a minute)...", file=sys.stderr)
    tokenizer = AutoTokenizer.from_pretrained(config.base_model_id)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        config.base_model_id,
        torch_dtype=getattr(torch, config.torch_dtype),
    )

    peft_config = LoraConfig(
        r=config.lora_r,
        lora_alpha=config.lora_alpha,
        lora_dropout=config.lora_dropout,
        target_modules=config.lora_target_modules,
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()
    return model, tokenizer


def build_trainer(config: LoraSftConfig, model, tokenizer, max_steps: int | None = None):
    from datasets import load_dataset
    from trl import SFTConfig, SFTTrainer

    if not (DATA_DIR / "train.jsonl").exists():
        print(
            f"ERROR: {DATA_DIR / 'train.jsonl'} not found — run data/prepare_data.py first.",
            file=sys.stderr,
        )
        sys.exit(1)

    dataset = load_dataset(
        "json",
        data_files={
            "train": str(DATA_DIR / "train.jsonl"),
            "validation": str(DATA_DIR / "val.jsonl"),
        },
    )

    sft_config = SFTConfig(
        output_dir=str(CHECKPOINT_DIR / config.name),
        per_device_train_batch_size=config.per_device_train_batch_size,
        gradient_accumulation_steps=config.gradient_accumulation_steps,
        # `max_seq_length`, NOT `max_length` — confirmed live against the
        # actually-installed trl==0.15.2's real SFTConfig signature
        # (`max_length` doesn't exist on it, a real API mismatch from an
        # incorrect initial guess, not a version pin issue).
        max_seq_length=config.max_seq_length,
        learning_rate=config.learning_rate,
        lr_scheduler_type=config.lr_scheduler_type,
        warmup_ratio=config.warmup_ratio,
        num_train_epochs=config.num_train_epochs,
        weight_decay=config.weight_decay,
        logging_steps=config.logging_steps,
        eval_strategy=config.eval_strategy,
        save_strategy=config.save_strategy,
        save_total_limit=config.save_total_limit,
        seed=config.seed,
        report_to=[],
        max_steps=max_steps if max_steps is not None else -1,
        # No fp16/bf16 mixed precision — see lora_config.py's own comment
        # on why that's not a real win on this CPU.
        fp16=False,
        bf16=False,
        # Force CPU, explicitly — this "no GPU" machine turned out to have
        # a real Metal-capable discrete GPU after all (a 2017 MacBook Pro),
        # and newer `accelerate` auto-detects and uses it via MPS by
        # default. Confirmed live: it immediately hit a hard MPS
        # out-of-memory wall (6.18GB allocated against a 6.8GB ceiling) on
        # the very first batch — this GPU's usable memory is too small for
        # even this small a model/batch. CPU is slower but was the actual
        # target platform this whole pipeline was designed and sized for;
        # revisit MPS only with a deliberately memory-tuned config (much
        # smaller batch, gradient checkpointing), not as a default.
        use_cpu=True,
    )

    return SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=dataset["train"],
        eval_dataset=dataset["validation"],
        processing_class=tokenizer,
    )


def measure_only(config: LoraSftConfig, model, tokenizer) -> None:
    steps = 8
    print(f"\n--measure-only: running {steps} real training steps to time this machine...", file=sys.stderr)
    trainer = build_trainer(config, model, tokenizer, max_steps=steps)

    start = time.time()
    trainer.train()
    elapsed = time.time() - start
    seconds_per_step = elapsed / steps

    # Rough total-step estimate for a full run, purely for the printed
    # extrapolation below — real step count depends on dataset size, which
    # varies run to run.
    import json

    train_lines = sum(1 for _ in (DATA_DIR / "train.jsonl").open())
    effective_batch = config.per_device_train_batch_size * config.gradient_accumulation_steps
    steps_per_epoch = max(1, train_lines // effective_batch)
    total_steps = steps_per_epoch * config.num_train_epochs

    print("\n" + "=" * 60, file=sys.stderr)
    print(f"Measured: {seconds_per_step:.1f}s/step on this machine", file=sys.stderr)
    print(
        f"Dataset: {train_lines} train examples, effective batch {effective_batch} "
        f"-> ~{steps_per_epoch} steps/epoch x {config.num_train_epochs} epochs "
        f"= ~{total_steps} total steps",
        file=sys.stderr,
    )
    est_hours = (total_steps * seconds_per_step) / 3600
    print(f"Rough full-run estimate: ~{est_hours:.1f} hours", file=sys.stderr)
    print("=" * 60, file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--measure-only", action="store_true", help="run a handful of steps, report timing, exit")
    args = parser.parse_args()

    config = DEFAULT_CONFIG
    model, tokenizer = load_model_and_tokenizer(config)

    if args.measure_only:
        measure_only(config, model, tokenizer)
        return

    print(f"\nStarting full training run: {config.name}", file=sys.stderr)
    print(
        "Reminder: this is a multi-hour job on this hardware — see README.md "
        "for nohup/caffeinate recommendations if not already running that way.",
        file=sys.stderr,
    )
    trainer = build_trainer(config, model, tokenizer)
    trainer.train()

    adapter_dir = CHECKPOINT_DIR / config.name / "final_adapter"
    trainer.save_model(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))
    print(f"\nDone. LoRA adapter saved to {adapter_dir}", file=sys.stderr)
    print("Next: export/merge_lora.py", file=sys.stderr)


if __name__ == "__main__":
    main()
