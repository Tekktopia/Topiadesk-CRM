"""Extracts the 18 built-in Q&A pairs from
backend/api/src/modules/ai-gateway/local/app-help-corpus.ts into JSON.

Deliberately a regex parser, not a TS/AST tool — the corpus file's shape is
a stable, single-line-per-entry literal array (`{ question: '...', answer:
'...' }`), and pulling in a JS/TS parser just to read ~20 lines would be
disproportionate. Trade-off, stated plainly: if that file's structure ever
changes (renamed fields, multiline strings), this regex breaks and needs a
manual update — acceptable for a file that changes rarely, and it fails
loudly (empty output, printed warning) rather than silently mis-parsing.

Usage: python export_app_help_corpus.py > ../processed/app_help_corpus.json
(or let prepare_data.py call this module directly — see that file)
"""

import json
import re
import sys
from pathlib import Path

CORPUS_TS_PATH = (
    Path(__file__).resolve().parents[3]
    / "backend"
    / "api"
    / "src"
    / "modules"
    / "ai-gateway"
    / "local"
    / "app-help-corpus.ts"
)

# (?:[^'\\]|\\.)* matches any run of characters that are neither a quote nor
# a backslash, OR an escaped character (\', \\, etc.) — correctly handles
# the file's escaped apostrophes ("doesn\'t", "it\'s") without the match
# terminating early on them.
ENTRY_PATTERN = re.compile(
    r"\{\s*question:\s*'((?:[^'\\]|\\.)*)',\s*answer:\s*'((?:[^'\\]|\\.)*)'\s*\}"
)


def unescape_ts_string(s: str) -> str:
    return s.replace("\\'", "'").replace('\\\\', '\\')


def extract() -> list[dict[str, str]]:
    text = CORPUS_TS_PATH.read_text(encoding="utf-8")
    entries = []
    for match in ENTRY_PATTERN.finditer(text):
        question, answer = match.groups()
        entries.append(
            {
                "question": unescape_ts_string(question),
                "answer": unescape_ts_string(answer),
            }
        )
    return entries


def main() -> None:
    entries = extract()
    if not entries:
        print(
            f"WARNING: extracted 0 entries from {CORPUS_TS_PATH} — "
            "the file's structure may have changed; check the regex in this script.",
            file=sys.stderr,
        )
    else:
        print(f"Extracted {len(entries)} entries from app-help-corpus.ts", file=sys.stderr)
    print(json.dumps(entries, indent=2))


if __name__ == "__main__":
    main()
