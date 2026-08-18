"""Merges the trained LoRA adapter into the base model's weights, producing
a standalone HF-format model directory (no PEFT dependency needed to load
it afterward) — the input to the ONNX conversion step.

Usage: python merge_lora.py [--adapter-dir ../output/checkpoints/topiadesk-chat-v1/final_adapter]
Output: ../output/merged/
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

DEFAULT_ADAPTER_DIR = (
    Path(__file__).resolve().parents[1] / "output" / "checkpoints" / "topiadesk-chat-v1" / "final_adapter"
)
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output" / "merged"


def main() -> None:
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter-dir", type=Path, default=DEFAULT_ADAPTER_DIR)
    parser.add_argument("--base-model-id", default="Qwen/Qwen2.5-0.5B-Instruct")
    args = parser.parse_args()

    if not args.adapter_dir.exists():
        print(f"ERROR: adapter dir not found: {args.adapter_dir} — run train/lora_sft.py first.", file=sys.stderr)
        sys.exit(1)

    print(f"Loading base model {args.base_model_id}...", file=sys.stderr)
    base_model = AutoModelForCausalLM.from_pretrained(args.base_model_id, torch_dtype=torch.float32)
    tokenizer = AutoTokenizer.from_pretrained(args.base_model_id)

    print(f"Loading + merging LoRA adapter from {args.adapter_dir}...", file=sys.stderr)
    peft_model = PeftModel.from_pretrained(base_model, str(args.adapter_dir))
    merged_model = peft_model.merge_and_unload()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    merged_model.save_pretrained(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))
    print(f"Merged model saved to {OUTPUT_DIR}", file=sys.stderr)
    print("Next: convert_to_onnx.sh", file=sys.stderr)


if __name__ == "__main__":
    main()
