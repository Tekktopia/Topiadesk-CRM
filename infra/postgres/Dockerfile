# =============================================================================
# TopiaDesk CRM — Postgres image, extended with the MinIO client (`mc`).
#
# Base: pgvector/pgvector:pg16 (Postgres 16 + the `vector` extension
# pre-built — required by schema.prisma's `extensions = [pgcrypto, vector]`).
# This is the exact image the role-bootstrap SQL in infra/postgres/init/ was
# validated against; do not switch to plain postgres:16.
#
# The only thing layered on top is a static `mc` (MinIO Client) binary,
# copied from the official minio/mc image rather than installed via
# apt-get — no package manager, no network fetch at build time beyond the
# two base image pulls, smallest possible diff from upstream. This is what
# lets infra/postgres/archive-wal.sh (the Postgres `archive_command`) ship
# WAL segments straight into the MinIO backups bucket.
#
# This SAME image also backs the `backup` service (docker-compose.yml),
# which overrides the entrypoint/command to run infra/backup/backup.sh on
# a real cron schedule instead of starting Postgres — reusing one image
# (already has pg_dump matching the server version + mc) instead of
# maintaining a second, near-duplicate one. `cron` is installed for that
# purpose only; the `postgres` service itself never invokes it.
# =============================================================================
FROM minio/mc:RELEASE.2025-08-13T08-35-41Z AS mc

FROM pgvector/pgvector:pg16

RUN apt-get update \
    && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/*

COPY --from=mc /usr/bin/mc /usr/local/bin/mc
RUN chmod 0755 /usr/local/bin/mc

COPY infra/postgres/archive-wal.sh /usr/local/bin/archive-wal.sh
COPY infra/backup/backup.sh /usr/local/bin/backup.sh
COPY infra/backup/backup-entrypoint.sh /usr/local/bin/backup-entrypoint.sh
RUN chmod 0755 /usr/local/bin/archive-wal.sh /usr/local/bin/backup.sh /usr/local/bin/backup-entrypoint.sh \
    && mkdir -p /app
