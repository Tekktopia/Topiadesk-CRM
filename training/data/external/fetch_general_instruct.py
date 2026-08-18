"""Pulls a small slice of an external, permissively-licensed instruction
dataset to mix into training — preserves general coherence and dilutes
overfitting on the ~85-100 TopiaDesk-specific examples alone.

LICENSE MATTERS: TopiaDesk ships commercially, so any mix-in data must be
usable in a model that ships in a commercial product.

  Uses: databricks/databricks-dolly-15k — Apache-2.0, unambiguously
  commercial-safe.

  Explicitly does NOT use: HuggingFaceH4/no_robots or similar — that
  dataset is CC-BY-NC-4.0 (non-commercial only). Do not swap it in without
  re-checking the license fits a commercial product.

This is the one part of the pipeline that needs real network access — that
is fine and expected: the "fully local, zero external calls" principle
this codebase holds elsewhere applies to the SERVING container at
runtime, not to this offline, one-time data-prep script.

Usage: python fetch_general_instruct.py [--n 300] > ../processed/general_instruct.json
"""

import argparse
import json
import sys

from datasets import load_dataset

DATASET_ID = "databricks/databricks-dolly-15k"
DEFAULT_N = 300


def fetch(n: int, seed: int = 42) -> list[dict[str, str]]:
    ds = load_dataset(DATASET_ID, split="train")
    # Single-turn only (no "context" field) — matches the exact input shape
    # chat-intent-router.ts's LLM fallback actually sends (one user message,
    # no multi-turn history, no retrieved-context injection).
    ds = ds.filter(lambda row: not row.get("context"))
    ds = ds.shuffle(seed=seed).select(range(min(n, len(ds))))

    return [{"question": row["instruction"], "answer": row["response"]} for row in ds]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=DEFAULT_N, help="number of examples to sample")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    examples = fetch(args.n, args.seed)
    print(
        f"Sampled {len(examples)} single-turn examples from {DATASET_ID} "
        "(Apache-2.0 — commercial-safe)",
        file=sys.stderr,
    )
    print(
        "NOTE: worth a quick manual skim before committing to this wholesale — "
        "Dolly's style is fairly encyclopedic/factual, TopiaDesk's own tone is "
        "warmer/more conversational; not blocking, just worth knowing.",
        file=sys.stderr,
    )
    print(json.dumps(examples, indent=2))


if __name__ == "__main__":
    main()
