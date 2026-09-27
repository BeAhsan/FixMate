#!/usr/bin/env bash
#
# What is running right now, and does it match what is on record?
#
#   bash ./deploy/status.sh
#
# Three things, deliberately in this order, because they are three different
# questions and only the first is what most people mean by "what's deployed":
#
#   1. what the containers are actually running
#   2. what the release record claims
#   3. whether those two agree
#
# The third is the one that earns the script. A record that disagrees with reality
# means something changed the running set outside the deploy path - a hand-run
# `docker compose up`, an aborted rollback, a container someone restarted by hand -
# and a rollback reads the record, not the containers. So a drifted record sends
# the next rollback to restore a set that was never the one that broke. That is
# worth a command rather than four greps.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fixmate}"
COMPOSE_FILE="docker-compose.prod.yml"
RELEASE_FILE="${APP_DIR}/.current-release"
LOG_FILE="${APP_DIR}/.release-history"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXMATE_SOURCE_ONLY=1 . "${SCRIPT_DIR}/deploy.sh"

# Colour, but only when a person is looking. Piping this into a file or another
# program should not leave escape sequences in it.
if [ -t 1 ]; then
    BOLD=$'\033[1m'; RED=$'\033[1;31m'; GREEN=$'\033[1;32m'; YELLOW=$'\033[1;33m'; OFF=$'\033[0m'
else
    BOLD=''; RED=''; GREEN=''; YELLOW=''; OFF=''
fi

cd "$APP_DIR"
[ -f "$COMPOSE_FILE" ] || { printf '%s\n' "${COMPOSE_FILE} not found in ${APP_DIR}" >&2; exit 1; }

# What a container is running, read from Docker rather than from compose's own
# idea of it.
#
# Held as newline-separated "service image" text and looked up with a function,
# not an associative array. `declare -A` would be the natural choice and it is
# bash 4+, while macOS still ships bash 3.2 - so a script written that way cannot
# be run, let alone rehearsed, on a developer's machine. `declare -a` is worse than
# useless here: it is an *indexed* array, so `RUNNING[admin-app]` evaluates
# `admin-app` as an arithmetic subscript and dies with "admin-app: unbound
# variable" under `set -u`. Neither spelling does what it looks like it does.
RUNNING="$(docker compose -f "$COMPOSE_FILE" ps --format '{{.Service}} {{.Image}}' 2>/dev/null || true)"

running_image() {
    printf '%s\n' "$RUNNING" | awk -v want="$1" '$1 == want { print $2; found = 1 } END { exit !found }'
}

printf '%sLive%s\n' "$BOLD" "$OFF"
if [ -z "$(printf '%s' "$RUNNING" | tr -d '[:space:]')" ]; then
    printf '  nothing is running\n'
else
    for component in $COMPONENTS mysql redis queue scheduler; do
        image="$(running_image "$component")" || continue
        # Only the five platform components publish an address. Printing a port
        # for the rest would be a lie, and an operator would try to curl it.
        port=""
        case "$component" in
            app|user-app|worker-app|admin-app|super-admin-app) port="$(port_for "$component")" ;;
        esac
        if [ -n "$port" ]; then
            printf '  %-16s %-52s :%s\n' "$component" "$image" "$port"
        else
            printf '  %-16s %s\n' "$component" "$image"
        fi
    done
fi

if [ ! -f "$RELEASE_FILE" ]; then
    printf '\n%sNo release is recorded%s - nothing has been deployed by the pipeline yet.\n' "$YELLOW" "$OFF"
    exit 0
fi

printf '\n%sOn record%s\n' "$BOLD" "$OFF"
sed 's/^/  /' "$RELEASE_FILE"

if [ -f "$LOG_FILE" ]; then
    printf '\n%sHistory%s  %s release(s) recorded\n' "$BOLD" "$OFF" "$(history_count)"
    grep '^--- ' "$LOG_FILE" | tail -n 5 | sed 's/^--- /  /'
fi

# The comparison. Every recorded component is checked against what its container
# is running, and a missing container counts as a disagreement rather than being
# skipped - "no record for it" and "it is not running" are both worth reporting.
printf '\n%sAgreement%s\n' "$BOLD" "$OFF"
drift=0

# The record is read through `$(cat ...)` and re-emitted with `printf '%s\n'`, so
# the loop below is always handed a newline-terminated stream.
#
# This is not fussiness. `read` returns non-zero on a final line that has no
# newline, so a plain `while read` skips that line and the last component in the
# record goes unchecked - which is exactly what happened here, with
# super-admin-app silently missing from the agreement check, because an earlier
# write left the file unterminated.
#
# The tempting alternative, `while read ... || [ -n "$var" ]`, is worse: `read` at
# EOF does not clear the variables it was given, so the guard stays true and the
# loop never ends. It was written, hung, and was replaced by this.
RECORD="$(cat "$RELEASE_FILE")"
printf '%s\n' "$RECORD" | while IFS='=' read -r component recorded; do
    [ -n "$component" ] || continue
    live="$(running_image "$component" || true)"
    if [ -z "$live" ]; then
        printf '  %s%-16s recorded as %s, but no container is running%s\n' "$RED" "$component" "$recorded" "$OFF"
        drift=1
    elif [ "$live" != "$recorded" ]; then
        printf '  %s%-16s running %s, recorded as %s%s\n' "$RED" "$component" "$live" "$recorded" "$OFF"
        drift=1
    else
        printf '  %s%-16s %s%s\n' "$GREEN" "$component" "$live" "$OFF"
    fi
    # The `while` runs in a subshell, so `drift` set inside it is lost. The
    # disagreement is therefore re-derived below from the comparison itself rather
    # than from a flag - which is also why the counting check below exists.
done

# Every recorded component must actually have been compared. Counted rather than
# assumed, because the failure being guarded against is precisely a component
# going unchecked while the script reports that everything agrees.
compared="$(printf '%s\n' "$RECORD" | grep -c '=' || true)"
checked=0
while IFS='=' read -r component _recorded; do
    [ -n "$component" ] && checked=$((checked + 1))
done <<EOF
$RECORD
EOF

if [ "$checked" -ne "$compared" ]; then
    printf '  %sOnly %s of %s recorded components were compared - the check is not trustworthy.\n' \
        "$RED" "$checked" "$compared" "$OFF"
    drift=1
fi

# Re-derive the verdict outside the subshell, one component at a time.
while IFS='=' read -r component recorded; do
    [ -n "$component" ] || continue
    live="$(running_image "$component" || true)"
    [ "$live" = "$recorded" ] || drift=1
done <<EOF
$RECORD
EOF

if [ "$drift" -ne 0 ]; then
    printf '\n%sThe record and the running set disagree.%s\n' "$YELLOW" "$OFF"
    printf 'A rollback restores what is on record, not what is running, so fix this\n'
    printf 'before rolling back: either re-run the deploy, or correct the record.\n'
    exit 1
fi

printf '\n%sThe record matches what is running.%s\n' "$GREEN" "$OFF"
