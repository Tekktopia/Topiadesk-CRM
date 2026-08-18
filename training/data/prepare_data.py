"""Orchestrates the full data-prep pipeline: extract -> augment -> mix in
external data -> format to Qwen's chat template -> train/val split -> write
manifest.

Usage:
  python prepare_data.py [--external-n 300] [--val-fraction 0.1] [--seed 42]

Output: ../output/data/{train,val}.jsonl (each row a `{"messages": [...]}`
chat-formatted example) + ../output/data/MANIFEST.json
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "extract"))
sys.path.insert(0, str(Path(__file__).resolve().parent / "external"))

from augment import augment  # noqa: E402
from export_app_help_corpus import extract as extract_app_help  # noqa: E402
from export_kb_articles import extract as extract_kb_articles  # noqa: E402
from fetch_general_instruct import DATASET_ID, fetch as fetch_external  # noqa: E402
from manifest import write_manifest  # noqa: E402

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output" / "data"

# Copied VERBATIM from chat-intent-router.ts's own comment (see that
# file's answerKbHelp() header) — this is the exact system prompt serving
# actually sends. Keep this in manual sync if that text ever changes; no
# shared import path exists between this Python project and the TS app.
LLM_SYSTEM_PROMPT = (
    "You are the TopiaDesk CRM assistant, talking to an insurance broker or account handler "
    "inside their own CRM. Be warm, direct, and concise (2-4 sentences). You have NO access to "
    "this specific tenant's live data at this point in the conversation — never invent a specific "
    "account name, policy number, amount, or figure. If the question depends on real data, say so "
    "plainly and suggest the user name a specific account, or ask about their pipeline, win rate, "
    "renewals, or policy count, which this assistant CAN look up directly. Otherwise, just answer "
    "helpfully from general knowledge about how an insurance brokerage CRM works."
)


def to_chat_example(question: str, answer: str) -> dict:
    return {
        "messages": [
            {"role": "system", "content": LLM_SYSTEM_PROMPT},
            {"role": "user", "content": question},
            {"role": "assistant", "content": answer},
        ]
    }


def kb_article_to_examples(article: dict) -> list[dict]:
    """A KB article's title/body doesn't naturally fit as one Q&A pair the way
    app-help entries already do — synthesize a small handful of natural
    question phrasings a user might ask that this article answers, all
    sharing the (lightly trimmed, since replies stay 2-4 sentences per the
    system prompt) body content as the answer."""
    title = article["title"]
    body = article["bodyMarkdown"].strip()
    # Keep answers reasonably short, matching the system prompt's own
    # 2-4 sentence guidance — truncate very long article bodies rather
    # than teaching the model to always produce long replies.
    if len(body) > 600:
        body = body[:600].rsplit(".", 1)[0] + "."
    questions = [
        f"what is {title.lower()}",
        f"can you explain {title.lower()}",
        f"tell me about {title.lower()}",
    ]
    return [to_chat_example(q, body) for q in questions]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--external-n", type=int, default=300)
    parser.add_argument("--val-fraction", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    print("Extracting app-help corpus...", file=sys.stderr)
    app_help = extract_app_help()

    print("Augmenting with paraphrase variants...", file=sys.stderr)
    app_help_augmented = augment(app_help)

    print("Extracting published KB articles...", file=sys.stderr)
    kb_articles = extract_kb_articles()

    print(f"Fetching {args.external_n} external instruction examples...", file=sys.stderr)
    external = fetch_external(args.external_n, seed=args.seed)

    examples: list[dict] = []
    for entry in app_help_augmented:
        examples.append(to_chat_example(entry["question"], entry["answer"]))
    for article in kb_articles:
        examples.extend(kb_article_to_examples(article))
    for entry in external:
        examples.append(to_chat_example(entry["question"], entry["answer"]))

    rng = random.Random(args.seed)
    rng.shuffle(examples)

    val_count = max(1, int(len(examples) * args.val_fraction))
    val_examples = examples[:val_count]
    train_examples = examples[val_count:]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    train_path = OUTPUT_DIR / "train.jsonl"
    val_path = OUTPUT_DIR / "val.jsonl"
    with train_path.open("w", encoding="utf-8") as f:
        for ex in train_examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    with val_path.open("w", encoding="utf-8") as f:
        for ex in val_examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    manifest_path = write_manifest(
        output_dir=OUTPUT_DIR,
        app_help_count=len(app_help),
        app_help_augmented_count=len(app_help_augmented),
        kb_articles=kb_articles,
        external_dataset_id=DATASET_ID,
        external_count=len(external),
        train_count=len(train_examples),
        val_count=len(val_examples),
    )

    print(
        f"\nDone: {len(train_examples)} train / {len(val_examples)} val examples "
        f"written to {OUTPUT_DIR}\nManifest: {manifest_path}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
