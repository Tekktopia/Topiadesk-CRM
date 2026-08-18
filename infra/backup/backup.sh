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

# Integrity gate before anything is trusted or pruned against. pg_dump can
# exit 0 having written a truncated archive if the volume fills mid-write;
# `pg_restore --list` parses the custom-format table of contents and fails
# on exactly that. Cheap (reads the TOC, not the data) and it is the
# difference between "we have backups" and "we have files".
echo "[backup] verifying dump integrity..."
if ! pg_restore --list "${DUMP_FILE}" >/dev/null 2>&1; then
  echo "[backup] FATAL: ${DUMP_FILE} is not a readable pg_dump archive — refusing to upload." >&2
  rm -f "${DUMP_FILE}"
  exit 1
fi

echo "[backup] dump complete ($(du -h "${DUMP_FILE}" | cut -f1)), uploading to MinIO..."
mc alias set "${MC_ALIAS}" "${MC_SCHEME}://${MINIO_ENDPOINT}:${MINIO_PORT}" \
  "${MINIO_APP_ACCESS_KEY}" "${MINIO_APP_SECRET_KEY}" >/dev/null 2>&1

mc cp --quiet "${DUMP_FILE}" "${MC_ALIAS}/${MINIO_BACKUPS_BUCKET}/base/$(basename "${DUMP_FILE}")"

echo "[backup] pruning backups older than ${BACKUP_RETENTION_DAYS:-30} day(s)..."
mc rm --recursive --force --older-than "${BACKUP_RETENTION_DAYS:-30}d" \
  "${MC_ALIAS}/${MINIO_BACKUPS_BUCKET}/base/" >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# Offsite replication
# ---------------------------------------------------------------------------
# Everything above this line writes to the MinIO running in THIS compose
# stack, on THIS host, backed by a local Docker volume. That protects
# against "someone dropped a table"; it protects against nothing that takes
# the host with it — disk failure, an accidental `docker volume rm`, the
# instance being terminated. A backup that only exists on the machine it is
# backing up is not a disaster-recovery story.
#
# Any S3-compatible target works, since mc speaks S3: AWS S3, Cloudflare R2,
# Backblaze B2, Wasabi, or a MinIO on different hardware. Configure it with
# a bucket-scoped credential that can PUT but not DELETE where the provider
# supports it — then a compromise of this host cannot erase the offsite
# copies too. Object-lock / versioning on that bucket is the stronger form
# of the same idea and is worth turning on.
#
# Unset (the local-dev default) means "skip, and say so" — silence here
# would read identically to a successful upload in the logs.
OFFSITE_ENDPOINT="${BACKUP_OFFSITE_ENDPOINT:-}"
if [ -z "${OFFSITE_ENDPOINT}" ]; then
  echo "[backup] offsite replication not configured (BACKUP_OFFSITE_ENDPOINT unset) — local copy only."
  rm -f "${DUMP_FILE}"
  echo "[backup] $(date -u +%FT%TZ) done: ${MINIO_BACKUPS_BUCKET}/base/$(basename "${DUMP_FILE}")"
  exit 0
fi

OFFSITE_ALIAS="topiadesk_offsite"
OFFSITE_SCHEME="https"
if [ "${BACKUP_OFFSITE_USE_SSL:-true}" = "false" ]; then
  OFFSITE_SCHEME="http"
fi

echo "[backup] replicating offsite to ${OFFSITE_ENDPOINT}/${BACKUP_OFFSITE_BUCKET}..."
if ! mc alias set "${OFFSITE_ALIAS}" "${OFFSITE_SCHEME}://${OFFSITE_ENDPOINT}" \
    "${BACKUP_OFFSITE_ACCESS_KEY}" "${BACKUP_OFFSITE_SECRET_KEY}" >/dev/null 2>&1; then
  echo "[backup] ERROR: could not authenticate to the offsite target. Local backup IS stored;" >&2
  echo "         the offsite copy is MISSING. Check BACKUP_OFFSITE_* credentials." >&2
  rm -f "${DUMP_FILE}"
  exit 1
fi

if ! mc cp --quiet "${DUMP_FILE}" \
    "${OFFSITE_ALIAS}/${BACKUP_OFFSITE_BUCKET}/base/$(basename "${DUMP_FILE}")"; then
  echo "[backup] ERROR: offsite upload failed. Local backup IS stored; the offsite copy is MISSING." >&2
  rm -f "${DUMP_FILE}"
  exit 1
fi

# Offsite retention is deliberately its own knob and defaults LONGER than
# the local one: the offsite copy is the one that matters for a real
# disaster, and cheap cold storage is the normal place to keep more history.
# Skipped entirely when set to 0, which is what you want if the bucket has
# a provider-side lifecycle policy or object lock doing this instead.
OFFSITE_RETENTION="${BACKUP_OFFSITE_RETENTION_DAYS:-90}"
if [ "${OFFSITE_RETENTION}" != "0" ]; then
  echo "[backup] pruning offsite copies older than ${OFFSITE_RETENTION} day(s)..."
  mc rm --recursive --force --older-than "${OFFSITE_RETENTION}d" \
    "${OFFSITE_ALIAS}/${BACKUP_OFFSITE_BUCKET}/base/" >/dev/null 2>&1 || true
fi

rm -f "${DUMP_FILE}"
echo "[backup] $(date -u +%FT%TZ) done: local + offsite copies of $(basename "${DUMP_FILE}")"
