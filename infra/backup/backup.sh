#!/bin/sh
# =============================================================================
# TopiaDesk CRM — periodic logical backup (Phase-1 backup mechanism).
#
# Runs pg_dump (custom format, compressed, restorable with pg_restore)
# against Postgres DIRECTLY (bypassing PgBouncer, same reasoning as Prisma
# Migrate — pg_dump wants a plain session connection, not a transaction-mode
# pooled one) as app_migrator (the schema owner — can read every table),
# then uploads the artifact to the MinIO backups bucket via `mc cp` and
# prunes artifacts older than BACKUP_RETENTION_DAYS.
#
# This is the SIMPLER of the two DR mechanisms described in the build plan:
#   - `pg_dump` (this script): point-in-time logical snapshot, run on
#     BACKUP_CRON_SCHEDULE (default every 6h). Simple, always restorable
#     with plain `pg_restore`, but RPO is bounded by the schedule interval.
#   - Continuous WAL archiving (infra/postgres/archive-wal.sh +
#     postgresql.conf archive_command): near-zero RPO, but requires a base
#     backup + WAL replay to restore. Both ship to the same
#     MINIO_BACKUPS_BUCKET under different prefixes (base/ vs wal/) so a
#     full restore drill uses one bucket, two prefixes.
#
# Invoked both by cron (see backup-entrypoint.sh, which also runs it once
# immediately on container start) and manually via
# `docker compose exec backup /usr/local/bin/backup.sh` for an ad hoc backup.
# =============================================================================
set -eu

# Cron jobs run with a near-empty environment; re-source the snapshot the
# entrypoint captured at container start. Harmless no-op when this script is
# invoked directly in a shell that already has the full environment.
[ -f /app/env.sh ] && . /app/env.sh

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="/tmp/topiadesk-${TIMESTAMP}.dump"

MC_ALIAS="topiadesk_backup"
MC_SCHEME="http"
if [ "${MINIO_USE_SSL:-false}" = "true" ]; then
  MC_SCHEME="https"
fi

echo "[backup] $(date -u +%FT%TZ) starting pg_dump of ${POSTGRES_DB}@${POSTGRES_HOST}:${POSTGRES_PORT}..."
PGPASSWORD="${POSTGRES_MIGRATOR_PASSWORD}" pg_dump \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_MIGRATOR_USER}" \
  --dbname="${POSTGRES_DB}" \
  --format=custom \
  --compress=6 \
  --file="${DUMP_FILE}"

echo "[backup] dump complete ($(du -h "${DUMP_FILE}" | cut -f1)), uploading to MinIO..."
mc alias set "${MC_ALIAS}" "${MC_SCHEME}://${MINIO_ENDPOINT}:${MINIO_PORT}" \
  "${MINIO_APP_ACCESS_KEY}" "${MINIO_APP_SECRET_KEY}" >/dev/null 2>&1

mc cp --quiet "${DUMP_FILE}" "${MC_ALIAS}/${MINIO_BACKUPS_BUCKET}/base/$(basename "${DUMP_FILE}")"
rm -f "${DUMP_FILE}"

echo "[backup] pruning backups older than ${BACKUP_RETENTION_DAYS:-30} day(s)..."
mc rm --recursive --force --older-than "${BACKUP_RETENTION_DAYS:-30}d" \
  "${MC_ALIAS}/${MINIO_BACKUPS_BUCKET}/base/" >/dev/null 2>&1 || true

echo "[backup] $(date -u +%FT%TZ) done: ${MINIO_BACKUPS_BUCKET}/base/$(basename "${DUMP_FILE}")"
