#!/usr/bin/env bash
#
# Detects (and optionally repairs) Docker network-attachment drift.
#
# WHY THIS EXISTS
# ---------------
# Four services — api, web, keycloak, global-admin — are declared on BOTH
# topiadesk_data and topiadesk_public. Containers have repeatedly been
# observed running with only one of the two actually attached, most often
# after an individual `docker compose up -d --no-deps <service>` or a Docker
# Desktop restart. Compose does not notice: it compares the container's
# config hash against the compose file, and that hash still matches, so
# `up -d` reports everything up-to-date and changes nothing.
#
# The failure is silent until something crosses the missing network, and the
# symptom points away from the cause:
#   - keycloak without topiadesk_data cannot reach Postgres, so it boots,
#     fails its DB connection, and login returns HTTP 500 from `web`.
#   - api without topiadesk_public is unreachable by Traefik, so
#     api.<domain> 502s while `docker ps` shows a healthy container.
# Both look like application bugs. Neither is.
#
# Declared networks are read from `docker compose config`, not hardcoded, so
# this stays correct if a service's networks change.
#
# USAGE
#   scripts/check-container-networks.sh          # report only; non-zero exit on drift
#   scripts/check-container-networks.sh --fix    # reconnect anything missing
#
# The report-only mode is the useful one in CI or a deploy pipeline: exit 1
# means "do not consider this deploy finished".
set -euo pipefail

cd "$(dirname "$0")/.."

FIX=0
[[ "${1:-}" == "--fix" ]] && FIX=1

if ! docker compose config --format json >/tmp/.tdk-netcheck.json 2>/dev/null; then
  echo "error: 'docker compose config' failed — run this from the repo root with a valid .env" >&2
  exit 2
fi

# Emits one "service<TAB>network" line per declared attachment.
declared=$(python3 - <<'PY'
import json
with open('/tmp/.tdk-netcheck.json') as fh:
    cfg = json.load(fh)
for name, svc in sorted(cfg.get('services', {}).items()):
    for net in (svc.get('networks') or {}):
        print(f"{name}\t{net}")
PY
)

project=$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')
drift=0
repaired=0

while IFS=$'\t' read -r service network; do
  [[ -z "$service" ]] && continue

  # Resolve the real container id via Compose rather than guessing
  # "<project>-<service>-1": that naming assumption breaks under scaling and
  # under a COMPOSE_PROJECT_NAME override.
  cid=$(docker compose ps -q "$service" 2>/dev/null | head -1 || true)
  [[ -z "$cid" ]] && continue   # not running (one-shot job, or intentionally stopped)

  if docker inspect "$cid" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' \
      2>/dev/null | grep -qx "$network"; then
    continue
  fi

  drift=1
  echo "DRIFT: $service is missing network $network"

  if [[ "$FIX" == "1" ]]; then
    # Alias by service name so in-cluster DNS ("http://keycloak:8080")
    # resolves exactly as Compose would have set it up.
    if docker network connect --alias "$service" "$network" "$cid" 2>/dev/null; then
      echo "  repaired: attached $service -> $network"
      repaired=$((repaired + 1))
    else
      echo "  FAILED to attach $service -> $network" >&2
    fi
  fi
done <<< "$declared"

rm -f /tmp/.tdk-netcheck.json

if [[ "$drift" == "0" ]]; then
  echo "OK: every running service is attached to all of its declared networks."
  exit 0
fi

if [[ "$FIX" == "1" ]]; then
  echo ""
  echo "Repaired $repaired attachment(s)."
  # Keycloak in particular caches its DB connection at boot; re-attaching the
  # network does not retroactively fix a process that already failed to
  # connect. Say so rather than leaving a half-fixed stack.
  echo "NOTE: a service that already failed to reach a dependency may need a restart," >&2
  echo "      e.g. 'docker compose restart keycloak'." >&2
  exit 0
fi

echo ""
echo "Re-run with --fix to repair." >&2
exit 1
