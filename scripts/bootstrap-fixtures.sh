#!/bin/bash
# bootstrap-fixtures.sh — create the synthetic participant + two researchers and their app roles.
#
# BOOTSTRAP ONLY: must run while the realm is still in firstAdmin mode (before any tide-realm-admin
# grant is committed). In that mode TideCloak signs change requests server-side. Afterwards every
# governed write needs enclave approvals from the admin quorum, and this script will (correctly) fail.
#
# Each identity still has to enrol its OWN Tide account through its one-time invite link; nothing here
# creates a Tide credential. Emails use the reserved `.invalid` TLD (RFC 2606): clearly synthetic.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$PROJECT_DIR/.env" ] && { set -a; . "$PROJECT_DIR/.env"; set +a; }
: "${KC_BOOTSTRAP_ADMIN_PASSWORD:?set in .env}"
TC="${TIDECLOAK_URL:-http://localhost:8080}"
REALM="${REALM_NAME:-consent-vault}"
R="$TC/admin/realms/$REALM"
INVITES_FILE="$PROJECT_DIR/data/invites.local.txt"

tok() {
  curl -s -X POST "$TC/realms/master/protocol/openid-connect/token" -d client_id=admin-cli -d grant_type=password \
    --data-urlencode "username=${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" --data-urlencode "password=$KC_BOOTSTRAP_ADMIN_PASSWORD" | jq -r .access_token
}
drain() {  # authorize + commit every pending CR (firstAdmin mode only)
  local T ids
  T="$(tok)"
  ids=$(curl -s "$R/iga/change-requests?status=PENDING" -H "Authorization: Bearer $T" \
    | jq -r '.[] | select(.actionType | IN("DISABLE_IGA","DELETE_REALM","OFFBOARD_REALM") | not) | .id')
  for id in $ids; do
    curl -s -o /dev/null -X POST "$R/iga/change-requests/$id/authorize" -H "Authorization: Bearer $(tok)" -H "Content-Type: application/json" -d '{}'
  done
  for pass in 1 2 3 4 5; do
    T="$(tok)"
    ids=$(curl -s "$R/iga/change-requests?status=PENDING" -H "Authorization: Bearer $T" | jq -r '.[] | select(.readyToCommit==true) | .id')
    [ -z "$ids" ] && break
    for id in $ids; do curl -s -o /dev/null -X POST "$R/iga/change-requests/$id/commit" -H "Authorization: Bearer $(tok)"; done
  done
}

FIXTURES="participant:participant researcher_a:researcher researcher_b:researcher"
for pair in $FIXTURES; do
  U="${pair%%:*}"
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$R/users" -H "Authorization: Bearer $(tok)" -H "Content-Type: application/json" \
    -d "{\"username\":\"$U\",\"email\":\"$U@consent-vault.invalid\",\"firstName\":\"$U\",\"lastName\":\"Synthetic\",\"enabled\":true,\"attributes\":{\"tideInvitable\":[\"true\"]}}")
  echo "create $U -> HTTP $code (202 = change request filed, 409 = exists)"
done
sleep 1; drain

touch "$INVITES_FILE"; chmod 600 "$INVITES_FILE"
# keep non-fixture lines (e.g. the admin link written by init), drop stale fixture links
grep -v -E "^(participant|researcher_a|researcher_b) " "$INVITES_FILE" > "$INVITES_FILE.tmp" || true; mv "$INVITES_FILE.tmp" "$INVITES_FILE"
for pair in $FIXTURES; do
  U="${pair%%:*}"; ROLE="${pair##*:}"
  T="$(tok)"
  ID=$(curl -s "$R/users?username=$U&exact=true" -H "Authorization: Bearer $T" | jq -r '.[0].id // empty')
  [ -z "$ID" ] && { echo "ERROR: $U was not created (change request not committed?)" >&2; exit 1; }
  ROLE_REP=$(curl -s "$R/roles/$ROLE" -H "Authorization: Bearer $T")
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$R/users/$ID/role-mappings/realm" -H "Authorization: Bearer $T" \
    -H "Content-Type: application/json" -d "[$ROLE_REP]")
  echo "grant $ROLE to $U -> HTTP $code"
done
sleep 1; drain

for pair in $FIXTURES; do
  U="${pair%%:*}"; ROLE="${pair##*:}"
  T="$(tok)"
  ID=$(curl -s "$R/users?username=$U&exact=true" -H "Authorization: Bearer $T" | jq -r '.[0].id')
  ROLES=$(curl -s "$R/users/$ID/role-mappings/realm" -H "Authorization: Bearer $T" | jq -c '[.[].name]')
  LINK=$(curl -s -X POST "$R/tideAdminResources/get-required-action-link?userId=$ID&lifespan=43200" \
    -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '["link-tide-account-action"]')
  echo "$U ($ROLE): $LINK" >> "$INVITES_FILE"
  echo "$U roles now: $ROLES"
done
echo "Invite links written to $INVITES_FILE (gitignored, one-time, 12h)."
