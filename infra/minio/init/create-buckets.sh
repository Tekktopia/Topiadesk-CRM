#!/bin/sh
# =============================================================================
# TopiaDesk CRM — MinIO bucket + scoped app-credential bootstrap.
#
# Runs as the `minio-init` one-off container (minio/mc image) after `minio`
# reports healthy (docker-compose.yml: depends_on: minio: condition:
# service_healthy). Safe to re-run — every step below is idempotent, so a
# manual re-run during local debugging (`docker compose run --rm
# minio-init`) never errors out on "already exists".
#
# Creates:
#   1. The 3 buckets from .env.example (documents, audit-worm, backups).
#      The audit-worm bucket is created WITH object-lock enabled
#      (`--with-lock`, which also enables versioning) — this is what makes
#      it actually WORM: once a default GOVERNANCE retention is applied,
#      objects cannot be deleted/overwritten until the retention period
#      expires, even by the root user, without an explicit
#      governance-bypass permission this app credential does not have.
#   2. A scoped IAM user (MINIO_APP_ACCESS_KEY/MINIO_APP_SECRET_KEY) that
#      api/worker actually authenticate as — NOT the MinIO root user. The
#      attached policy (topiadesk-app-policy, rendered inline below via a
#      shell heredoc) grants only Get/Put/Delete/ListBucket + object-
#      retention/legal-hold actions on exactly these 3 buckets, nothing
#      account/server-admin related.
# =============================================================================
set -eu

MC_ALIAS="local"
MC_SCHEME="http"
if [ "${MINIO_USE_SSL:-false}" = "true" ]; then
  MC_SCHEME="https"
fi

echo "[minio-init] waiting for MinIO at ${MINIO_ENDPOINT}:${MINIO_PORT}..."
until mc alias set "${MC_ALIAS}" "${MC_SCHEME}://${MINIO_ENDPOINT}:${MINIO_PORT}" \
  "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1; do
  sleep 2
done
echo "[minio-init] connected."

echo "[minio-init] ensuring buckets exist..."
mc mb --ignore-existing "${MC_ALIAS}/${MINIO_DOCUMENTS_BUCKET}"
mc mb --ignore-existing "${MC_ALIAS}/${MINIO_BACKUPS_BUCKET}"
# --with-lock only has effect at creation time; on an already-existing
# bucket it's a harmless no-op (mc just skips creation via --ignore-existing).
mc mb --ignore-existing --with-lock "${MC_ALIAS}/${MINIO_AUDIT_WORM_BUCKET}"

echo "[minio-init] enabling versioning + default WORM retention on ${MINIO_AUDIT_WORM_BUCKET}..."
mc version enable "${MC_ALIAS}/${MINIO_AUDIT_WORM_BUCKET}"
# GOVERNANCE (not COMPLIANCE): objects are protected from the scoped app
# credential and ordinary users, but an operator holding the MinIO root
# credential can still override in a genuine legal/incident scenario.
# COMPLIANCE mode (irreversible even for root) is the stronger option to
# switch to once retention duration is signed off by compliance/legal —
# documented here rather than defaulted to, since it cannot be undone.
mc retention set --default governance "2555d" "${MC_ALIAS}/${MINIO_AUDIT_WORM_BUCKET}"

echo "[minio-init] creating scoped application IAM user..."
mc admin user add "${MC_ALIAS}" "${MINIO_APP_ACCESS_KEY}" "${MINIO_APP_SECRET_KEY}"

echo "[minio-init] rendering + applying scoped app policy..."
POLICY_FILE="/tmp/topiadesk-app-policy.json"
# minio/mc is a minimal image with no `sed`/`envsubst` — rendered via a
# plain shell heredoc instead (POSIX sh interpolates $VARS in unquoted/
# double-quoted heredocs natively, no extra binary required). Source
# template retired in favor of this inline version so there's exactly one
# place defining the policy shape, not two that can drift.
cat > "${POLICY_FILE}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": [
        "arn:aws:s3:::${MINIO_DOCUMENTS_BUCKET}",
        "arn:aws:s3:::${MINIO_AUDIT_WORM_BUCKET}",
        "arn:aws:s3:::${MINIO_BACKUPS_BUCKET}"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObjectRetention",
        "s3:PutObjectRetention",
        "s3:GetObjectLegalHold",
        "s3:PutObjectLegalHold",
        "s3:GetObjectVersion"
      ],
      "Resource": [
        "arn:aws:s3:::${MINIO_DOCUMENTS_BUCKET}/*",
        "arn:aws:s3:::${MINIO_AUDIT_WORM_BUCKET}/*",
        "arn:aws:s3:::${MINIO_BACKUPS_BUCKET}/*"
      ]
    }
  ]
}
EOF

mc admin policy create "${MC_ALIAS}" topiadesk-app-policy "${POLICY_FILE}"
# `attach` errors if already attached on some mc versions — treat that as
# success rather than failing the whole (idempotent) bootstrap.
mc admin policy attach "${MC_ALIAS}" topiadesk-app-policy --user "${MINIO_APP_ACCESS_KEY}" \
  || echo "[minio-init] policy already attached to ${MINIO_APP_ACCESS_KEY} — continuing."

echo "[minio-init] done. Buckets: ${MINIO_DOCUMENTS_BUCKET}, ${MINIO_AUDIT_WORM_BUCKET} (WORM), ${MINIO_BACKUPS_BUCKET}."
