#!/usr/bin/env bash
#
# Manually redeploy the previous release on the VPS. Use when a bad release is
# still the recorded one, or when you need to get off a release quickly:
#
#   ./deploy/rollback.sh
#
# The Jenkins pipeline already rolls back automatically when a deploy fails, so
# you only need this for rolling back a deploy that looked healthy.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fixmate}"
COMPOSE_FILE="docker-compose.prod.yml"
RELEASE_FILE="${APP_DIR}/.current-release"
LOG_FILE="${APP_DIR}/.release-history"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mXXX %s\033[0m\n' "$*" >&2; exit 1; }

cd "$APP_DIR"
[ -f "$COMPOSE_FILE" ] || die "${COMPOSE_FILE} not found in ${APP_DIR}"
[ -f "$LOG_FILE" ] || die "No release history yet - nothing to roll back to."

CURRENT="$(cat "$RELEASE_FILE" 2>/dev/null || true)"
PREVIOUS="$(grep -v "^${CURRENT}$" "$LOG_FILE" | tail -n 1 || true)"

[ -n "$PREVIOUS" ] || die "Only one release on record (${CURRENT}). Nothing to roll back to."

log "Current:  ${CURRENT}"
log "Reverting to: ${PREVIOUS}"

# Migrations are not reversed. Verify the older code still works with the
# current schema before swapping.
read -r -p "Continue? Schema is NOT reverted. [y/N] " reply
[ "$reply" = "y" ] || die "Aborted."

APP_IMAGE="$PREVIOUS" docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

printf '%s' "$PREVIOUS" > "$RELEASE_FILE"
log "Rolled back to ${PREVIOUS}"
