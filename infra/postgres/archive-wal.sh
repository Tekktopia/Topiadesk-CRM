#!/bin/sh
# =============================================================================
# TopiaDesk CRM — WAL segment archiver, invoked by Postgres as
# `archive_command` (see postgresql.conf) once per completed/rotated WAL
# segment (or every archive_timeout seconds, whichever comes first).
#
# Ships the segment straight into the MinIO backups bucket so continuous WAL
# archiving is a real, working DR mechanism rather than a documented-only
# aspiration — this is the "near-term follow-up" the build spec allowed
# punting on, but it's cheap to do properly: `mc` is baked into the custom
# postgres image (see infra/postgres/Dockerfile) precisely for this.
#
# Design notes:
#  - `mc alias set` is re-run on every invocation instead of once at
#    container startup. It's a cheap local operation (writes ~/.mc/config)
#    and this makes archiving self-healing: if MinIO was briefly
#    unreachable when Postgres started, later WAL segments still archive
#    successfully without needing a container restart. Postgres itself
#    already retries a failing archive_command indefinitely with backoff,
#    so a transient failure here is never data loss — the segment simply
#    isn't recycled until it succeeds.
#  - Exit non-zero on ANY failure so Postgres knows to retry this exact
#    segment rather than silently losing it.
#  - Credentials come only from the postgres container's process
#    environment (set via docker-compose.yml from .env) — never written to
#    this file or logged.
# =============================================================================
set -eu

WAL_PATH="$1"
WAL_FILENAME="$2"

MC_ALIAS="topiadesk_backup_target"
MC_SCHEME="http"
if [ "${MINIO_USE_SSL:-false}" = "true" ]; then
  MC_SCHEME="https"
fi

export HOME="${HOME:-/var/lib/postgresql}"

mc alias set "${MC_ALIAS}" "${MC_SCHEME}://${MINIO_ENDPOINT}:${MINIO_PORT}" \
  "${MINIO_APP_ACCESS_KEY}" "${MINIO_APP_SECRET_KEY}" >/dev/null 2>&1

mc cp --quiet "${WAL_PATH}" "${MC_ALIAS}/${MINIO_BACKUPS_BUCKET}/wal/${WAL_FILENAME}" >/dev/null

echo "[archive-wal] shipped ${WAL_FILENAME} -> ${MINIO_BACKUPS_BUCKET}/wal/${WAL_FILENAME}"
