"""Records exactly which data sources (and, for KB articles, exact version
IDs) fed a given training run — the only mitigation this pipeline has for
fine-tuning being permanent/irrevocable (unlike a live RLS-protected DB
read, a retracted/corrected KB article stays "known" by any checkpoint
already trained on it). Written by prepare_data.py alongside the processed
train/val JSONL files.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


def write_manifest(
    output_dir: Path,
    app_help_count: int,
    app_help_augmented_count: int,
    kb_articles: list[dict[str, str]],
    external_dataset_id: str,
    external_count: int,
    train_count: int,
    val_count: int,
) -> Path:
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "appHelpCorpus": {
                "rawEntryCount": app_help_count,
                "afterAugmentationCount": app_help_augmented_count,
            },
            "knowledgeArticles": [
                {"articleId": a["articleId"], "title": a["title"], "versionId": a["versionId"]}
                for a in kb_articles
            ],
            "externalDataset": {
                "id": external_dataset_id,
                "sampledCount": external_count,
            },
        },
        "splits": {"train": train_count, "val": val_count},
    }
    path = output_dir / "MANIFEST.json"
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return path
