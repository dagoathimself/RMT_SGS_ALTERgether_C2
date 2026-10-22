#!/bin/bash
# finish-setup.sh — complete the realm after `npm run init` WITHOUT enrolling a governance admin.
#
# Scope decision (team, 2026-10-22): multi-admin governance enrolment is skipped for this entry.
# Consequence (documented in docs/VERIFICATION.md): the realm stays in TideCloak's bootstrap
# ("firstAdmin") mode, so governed changes are committed by the bootstrap operator alone. The
# contribution-access guarantee does not depend on admins (owner-held keys, Tide identity-bound).
#
# Steps: approve pending bootstrap change requests -> point the Tide IdP at this realm's console ->
# sign the IdP settings (needs the Tide network) -> export data/tidecloak.json for the app.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$PROJECT_DIR/.env" ] && { set -a; . "$PROJECT_DIR/.env"; set +a; }
: "${KC_BOOTSTRAP_ADMIN_PASSWORD:?set in .env}"
TC="${TIDECLOAK_URL:-http://localhost:8080}"
REALM="${REALM_NAME:-consent-vault}"
CLIENT="${CLIENT_NAME:-consent-vault-client}"
R="$TC/admin/realms/$REALM"
OUT="$PROJECT_DIR/data/tidecloak.json"

tok() {
  curl -s -X POST "$TC/realms/master/protocol/openid-connect/token" -d client_id=admin-cli -d grant_type=password \
    --data-urlencode "username=${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" --data-urlencode "password=$KC_BOOTSTRAP_ADMIN_PASSWORD" | jq -r .access_token
}

echo "==> Approving pending bootstrap change requests"
for id in $(curl -s "$R/iga/change-requests?status=PENDING" -H "Authorization: Bearer $(tok)" \
  | jq -r '.[] | select(.actionType | IN("DISABLE_IGA","DELETE_REALM","OFFBOARD_REALM") | not) | .id'); do
  curl -s -o /dev/null -X POST "$R/iga/change-requests/$id/authorize" -H "Authorization: Bearer $(tok)" -H "Content-Type: application/json" -d '{}'
done
for pass in 1 2 3 4 5; do
  ids=$(curl -s "$R/iga/change-requests?status=PENDING" -H "Authorization: Bearer $(tok)" | jq -r '.[] | select(.readyToCommit==true) | .id')
  [ -z "$ids" ] && break
  for id in $ids; do curl -s -o /dev/null -X POST "$R/iga/change-requests/$id/commit" -H "Authorization: Bearer $(tok)"; done
done

echo "==> Configuring the Tide IdP console origin and signing IdP settings"
T="$(tok)"
INST=$(curl -s "$R/identity-provider/instances/tide" -H "Authorization: Bearer $T")
echo "$INST" | jq --arg d "$TC/realms/$REALM/tide-console/" '.config.CustomAdminUIDomain=$d' \
  | curl -s -o /dev/null -w "    update IdP: HTTP %{http_code}\n" -X PUT "$R/identity-provider/instances/tide" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d @-
curl -s -o /dev/null -w "    sign-idp-settings: HTTP %{http_code}\n" -X POST "$R/vendorResources/sign-idp-settings" -H "Authorization: Bearer $(tok)"

echo "==> Exporting adapter config to data/tidecloak.json"
T="$(tok)"
CU=$(curl -s "$R/clients?clientId=$CLIENT" -H "Authorization: Bearer $T" | jq -r '.[0].id')
umask 077
curl -s "$R/vendorResources/get-installations-provider?clientId=$CU&providerId=keycloak-oidc-keycloak-json" -H "Authorization: Bearer $T" > "$OUT"
if jq -e 'has("jwk") and has("vendorId") and has("homeOrkUrl")' "$OUT" >/dev/null; then
  echo "    OK: adapter has jwk, vendorId, homeOrkUrl; client-origin-auth entries: $(jq '[keys[] | select(startswith("client-origin-auth"))] | length' "$OUT")"
else
  echo "ERROR: adapter export is missing Tide fields" >&2; exit 1
fi
