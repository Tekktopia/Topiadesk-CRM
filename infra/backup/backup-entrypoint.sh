#!/bin/sh
# =============================================================================
# TopiaDesk CRM — entrypoint for the `backup` service.
#
# Docker + cron gotcha this works around: cron jobs run with a minimal,
# nearly-empty environment, so BACKUP_CRON_SCHEDULE-triggered runs of
# backup.sh would not see POSTGRES_*/MINIO_* credentials unless captured
# up front. This snapshots the container's full environment (as set by
# docker-compose from .env) to /app/env.sh, which backup.sh sources at the
# top of every run — cron-triggered or manual.
#
# Also runs one backup immediately on container start (not just on the next
# cron tick, which could be hours away) so `docker compose up` visibly
# proves the mechanism works end to end, then hands off to a real cron
# daemon for BACKUP_CRON_SCHEDULE going forward — a sleep-loop cannot
# honor real cron syntax like "0 */6 * * *" correctly, so this uses actual
# cron (installed in infra/postgres/Dockerfile, which this service's image
# is built from) rather than approximate it.
# =============================================================================
set -eu

env | grep -E '^(POSTGRES_|MINIO_|BACKUP_)' | sed "s/^\([^=]*\)=\(.*\)$/export \1='\2'/" > /app/env.sh
chmod 0600 /app/env.sh

echo "[backup-entrypoint] running an initial backup now, then scheduling '${BACKUP_CRON_SCHEDULE}'..."
/usr/local/bin/backup.sh || echo "[backup-entrypoint] initial backup failed — will retry on the next cron tick."

printf '%s root /usr/local/bin/backup.sh >>/proc/1/fd/1 2>>/proc/1/fd/2\n' "${BACKUP_CRON_SCHEDULE}" \
  > /etc/cron.d/topiadesk-backup
chmod 0644 /etc/cron.d/topiadesk-backup

echo "[backup-entrypoint] handing off to cron."
exec cron -f
