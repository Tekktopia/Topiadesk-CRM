#!/usr/bin/env bash
# Enables the "microsoft" identity provider on the ALREADY-RUNNING
# "topiadesk" Keycloak realm, via the Admin REST API — a scripted
# alternative to the manual "Identity Providers -> microsoft -> Enabled"
# click documented in .env.example's own MICROSOFT_IDP_* comment (a
# realm-export.json change alone only applies on a fresh realm import, not
# to a live one, which is why this exists).
#
# Prerequisites (all one-time, done by you, outside this script — nothing
# here can create these for you):
#   1. A real Microsoft Entra ID (Azure AD) App Registration, in your own
#      Azure tenant, with a client secret generated.
#   2. Its redirect URI set to:
#        https://auth.topiadesk.localhost/realms/topiadesk/broker/microsoft/endpoint
#      (swap the host for your real Keycloak public URL outside local dev.)
#   3. MICROSOFT_IDP_TENANT_ID / MICROSOFT_IDP_CLIENT_ID /
#      MICROSOFT_IDP_CLIENT_SECRET set to real values in .env (these are
#      consumed directly by Keycloak's own env substitution, not by
#      TopiaDesk application code — see packages/config/src/env.ts's own
#      MICROSOFT_IDP comment for why they're not in that zod schema).
#
# Usage: KEYCLOAK_URL=https://auth.topiadesk.localhost ./enable-microsoft-sso.sh
# (defaults to https://auth.topiadesk.localhost if unset, matching local dev)

set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-https://auth.topiadesk.localhost}"
REALM="topiadesk"

: "${KEYCLOAK_ADMIN:?Set KEYCLOAK_ADMIN (master-realm bootstrap admin username, same one .env already defines)}"
: "${KEYCLOAK_ADMIN_PASSWORD:?Set KEYCLOAK_ADMIN_PASSWORD}"
: "${MICROSOFT_IDP_TENANT_ID:?Set MICROSOFT_IDP_TENANT_ID to your real Azure tenant id}"
: "${MICROSOFT_IDP_CLIENT_ID:?Set MICROSOFT_IDP_CLIENT_ID to your real Azure App Registration client id}"
: "${MICROSOFT_IDP_CLIENT_SECRET:?Set MICROSOFT_IDP_CLIENT_SECRET to your real Azure App Registration client secret}"

echo "[enable-microsoft-sso] fetching master-realm admin token…"
MASTER_TOKEN=$(curl -sk -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password" -d "client_id=admin-cli" \
  -d "username=$KEYCLOAK_ADMIN" -d "password=$KEYCLOAK_ADMIN_PASSWORD" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

if [ -z "$MASTER_TOKEN" ]; then
  echo "[enable-microsoft-sso] failed to obtain an admin token — check KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD" >&2
  exit 1
fi

echo "[enable-microsoft-sso] checking whether the 'microsoft' identity provider already exists on realm '$REALM'…"
EXISTING_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  "$KEYCLOAK_URL/admin/realms/$REALM/identity-provider/instances/microsoft")

BODY=$(cat <<JSON
{
  "alias": "microsoft",
  "displayName": "Microsoft",
  "providerId": "microsoft",
  "enabled": true,
  "trustEmail": true,
  "storeToken": false,
  "addReadTokenRoleOnCreate": false,
  "authenticateByDefault": false,
  "linkOnly": false,
  "firstBrokerLoginFlowAlias": "first broker login",
  "config": {
    "clientId": "$MICROSOFT_IDP_CLIENT_ID",
    "clientSecret": "$MICROSOFT_IDP_CLIENT_SECRET",
    "tenantId": "$MICROSOFT_IDP_TENANT_ID",
    "syncMode": "IMPORT",
    "defaultScope": "openid profile email User.Read"
  }
}
JSON
)

if [ "$EXISTING_STATUS" = "200" ]; then
  echo "[enable-microsoft-sso] identity provider already exists — updating it (PUT)…"
  curl -sk -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/identity-provider/instances/microsoft" \
    -H "Authorization: Bearer $MASTER_TOKEN" -H "Content-Type: application/json" \
    -d "$BODY" -w "\n[enable-microsoft-sso] PUT -> %{http_code}\n"
else
  echo "[enable-microsoft-sso] identity provider does not exist yet — creating it (POST)…"
  curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$REALM/identity-provider/instances" \
    -H "Authorization: Bearer $MASTER_TOKEN" -H "Content-Type: application/json" \
    -d "$BODY" -w "\n[enable-microsoft-sso] POST -> %{http_code}\n"
fi

echo "[enable-microsoft-sso] done — 'Sign in with Microsoft' should now appear on the topiadesk realm's login page."
echo "[enable-microsoft-sso] reminder: also flip \"enabled\": false -> true for the microsoft entry in infra/keycloak/realm-export.json so a FUTURE fresh realm import (not this live one) picks it up too — left untouched by this script/pass since it's the checked-in default for every environment, including ones without real Azure credentials configured yet."
