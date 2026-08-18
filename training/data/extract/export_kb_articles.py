"""Extracts PUBLISHED KnowledgeArticle content (title + body) into JSON.

A plain, read-only psycopg2 query against the DEV database, run manually by
a developer — NOT wired into any automated pipeline, application code, or
CI. This deliberately bypasses the app's own Prisma RLS layer (there's no
equivalent to `runWithRlsContext` here) — acceptable ONLY because it is a
manual, developer-run, read-only script. Never point DATABASE_HOST_URL (see
below) at a production connection string.

Connects to Postgres directly on localhost:5432 (NOT the `pgbouncer`
hostname docker-compose's own DATABASE_URL uses internally — that hostname
only resolves from inside the Docker network; this script runs on the host,
outside it, and postgres's own container already publishes 5432 to
localhost, confirmed via `docker port topiadesk-postgres-1`).

Usage:
  python export_kb_articles.py > ../processed/kb_articles.json
Requires the repo root .env to be present (reads POSTGRES_* / DATABASE_URL's
credential parts from it) — see load_db_config() below.
"""

import json
import sys
from pathlib import Path

import psycopg2
from dotenv import dotenv_values

ROOT_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"


def load_db_config() -> dict[str, str]:
    if not ROOT_ENV_PATH.exists():
        print(f"ERROR: repo root .env not found at {ROOT_ENV_PATH}", file=sys.stderr)
        sys.exit(1)
    env = dotenv_values(ROOT_ENV_PATH)
    missing = [k for k in ("POSTGRES_DB", "POSTGRES_RUNTIME_USER", "POSTGRES_RUNTIME_PASSWORD") if not env.get(k)]
    if missing:
        print(f"ERROR: .env is missing required keys: {missing}", file=sys.stderr)
        sys.exit(1)
    return {
        "host": "localhost",
        "port": 5432,
        "dbname": env["POSTGRES_DB"],
        "user": env["POSTGRES_RUNTIME_USER"],
        "password": env["POSTGRES_RUNTIME_PASSWORD"],
    }


QUERY = """
    SELECT ka.id, ka.title, kav.body_markdown, kav.id AS version_id
    FROM public.knowledge_articles ka
    JOIN public.knowledge_article_versions kav ON kav.id = ka.current_version_id
    WHERE ka.status = 'PUBLISHED'
    ORDER BY ka.title;
"""


def extract() -> list[dict[str, str]]:
    config = load_db_config()
    conn = psycopg2.connect(**config)
    try:
        with conn.cursor() as cur:
            cur.execute(QUERY)
            rows = cur.fetchall()
    finally:
        conn.close()

    return [
        {
            "articleId": str(article_id),
            "title": title,
            "bodyMarkdown": body_markdown,
            "versionId": str(version_id),
        }
        for article_id, title, body_markdown, version_id in rows
    ]


def main() -> None:
    articles = extract()
    print(f"Extracted {len(articles)} PUBLISHED knowledge articles", file=sys.stderr)
    if len(articles) < 5:
        print(
            "NOTE: very little published KB content exists right now — "
            "this is expected per the approved plan (only 2 articles at planning time); "
            "re-run this script before a retrain if more get published.",
            file=sys.stderr,
        )
    print(json.dumps(articles, indent=2))


if __name__ == "__main__":
    main()
