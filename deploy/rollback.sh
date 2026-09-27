#!/usr/bin/env bash
#
# Manually roll the whole set back to the previous release. Use when a bad release
# is still the recorded one, or when you need to get off a release quickly:
#
#   bash ./deploy/rollback.sh
#
# The Jenkins pipeline already rolls back automatically when a deploy fails, so
# you only need this for rolling back a deploy that looked healthy.
#
# All five components go back together, and that is the point of the sentence.
# Rolling back only the back end leaves the front ends built against a contract it
# no longer has, and the symptom is that nobody can sign in - which looks like an
# authentication bug and sends you looking in the code rather than at the release
# you are on.
#
# The functions come from deploy.sh, sourced rather than copied. Sourcing is safe:
# that script returns immediately when FIXMATE_SOURCE_ONLY is set, before it does
# anything. A second copy of the component-to-variable mapping in this file is
# exactly how a rollback comes to restore three front ends and forget the fourth.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fixmate}"
COMPOSE_FILE="docker-compose.prod.yml"
RELEASE_FILE="${APP_DIR}/.current-release"
LOG_FILE="${APP_DIR}/.release-history"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXMATE_SOURCE_ONLY=1 . "${SCRIPT_DIR}/deploy.sh"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mXXX %s\033[0m\n' "$*" >&2; exit 1; }

cd "$APP_DIR"
[ -f "$COMPOSE_FILE" ] || die "${COMPOSE_FILE} not found in ${APP_DIR}"
[ -f "$RELEASE_FILE" ]  || die "No current release recorded in ${RELEASE_FILE}."
[ -f "$LOG_FILE" ]      || die "No release history yet - nothing to roll back to."

CURRENT="$(cat "$RELEASE_FILE")"
ON_RECORD="$(history_count)"

# Two blocks in the history means there is something before the current one. One
# means the very first deploy, and there is genuinely nothing to go back to.
if [ "$ON_RECORD" -lt 2 ]; then
    die "Only one release on record. Nothing to roll back to."
fi

PREVIOUS="$(history_set_at 2)" || die "Could not read the previous release out of ${LOG_FILE}."

log "Releases on record: ${ON_RECORD}"
log "Currently recorded, and presumably live:"
printf '%s\n' "$CURRENT" | sed 's/^/    /'

log "Rolling back to:"
printf '%s\n' "$PREVIOUS" | sed 's/^/    /'

# Say what is about to change, in the operator's terms rather than as five image
# names. A rollback is the moment to notice that the front ends are going back
# further than expected.
log "This will change:"
diff <(printf '%s\n' "$CURRENT" | sort) <(printf '%s\n' "$PREVIOUS" | sort) \
    | grep -E '^[<>]' | sed 's/^/    /' || true

# Migrations are not reversed. MySQL cannot roll back DDL, so a release that
# migrated cannot be undone by putting the old image back - which is why every
# migration has to be written expand/contract, and why this prompt exists.
read -r -p "Continue? Schema is NOT reverted. [y/N] " reply
[ "$reply" = "y" ] || die "Aborted."

use_release_set "$PREVIOUS"

if ! docker compose -f "$COMPOSE_FILE" up -d --remove-orphans; then
    die "The rollback could not start the previous set. Intervene manually."
fi

# Confirm the result, because a rollback that reports success and leaves four of
# five components down is worse than one that fails loudly. Each component is
# checked on its own and named, with the same generous timeout the deploy uses -
# Docker's own health check needs ~90s to report a front end unhealthy, and a
# shorter wait would call a slow start a failure.
log "Verifying the rolled-back set"
failed=""
for component in $COMPONENTS; do
    if ! wait_for_component "$component"; then
        failed="$failed $component"
    fi
done

if [ -n "$failed" ]; then
    printf '%s\n' "$failed" | tr ' ' '\n' | grep -v '^$' | while read -r component; do
        docker compose -f "$COMPOSE_FILE" logs --tail 30 "$component" || true
    done
    die "Rolled back, but these did not come up:${failed}. The previous release is now the recorded one."
fi

# Only now is the record moved. Recording a rollback that did not work would
# leave the record describing containers that are not running, and the next
# rollback would restore whatever is in the history rather than what is live.
#
# The trailing newline is written deliberately. `history_set_at` output has been
# through `$(...)`, which strips one, and a record with no final newline makes the
# last component invisible to every `while read` loop that reads it - which is how
# super-admin-app came to be missing from status.sh's agreement check.
printf '%s\n' "$PREVIOUS" > "$RELEASE_FILE"

log "Rolled back. All five components are serving:"
printf '%s\n' "$PREVIOUS" | sed 's/^/    /'
warn "Schema was NOT reverted. Check that the previous code works against the current schema."
