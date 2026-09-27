#!/usr/bin/env bash
#
# Production deploy, as a SET of five images. Executed on the target VPS by the
# Jenkins pipeline:
#
#   bash ./deploy/deploy.sh ghcr.io/owner/fixmate/app:1.4.0
#
# ONE ARGUMENT, FIVE IMAGES.
#
# The four front-end references are derived from the app reference rather than
# passed alongside it, and that is the most important decision in this file. Five
# arguments would let the pipeline hand over a set that does not belong to one
# release - a new back end with three-day-old front ends - and nothing would
# object. The failure is silent and severe: the front ends were built against a
# contract the back end no longer has, and the symptom is that nobody can sign in
# at all. Deriving them makes that unrepresentable.
#
#   ghcr.io/owner/fixmate/app:1.4.0
#     -> ghcr.io/owner/fixmate/app:1.4.0
#     -> ghcr.io/owner/fixmate/user-app:1.4.0
#     -> ghcr.io/owner/fixmate/worker-app:1.4.0
#     -> ghcr.io/owner/fixmate/admin-app:1.4.0
#     -> ghcr.io/owner/fixmate/super-admin-app:1.4.0
#
# Each can still be overridden individually with the variables below, for the case
# where an image genuinely lives somewhere else. Overriding is a deliberate act
# with its own name in the log, not a default.
#
# This is also a coupling to ticket 24: the pipeline must name the images exactly
# this way. Change one and the other has to change too, and the deploy will fail
# loudly on a pull rather than serving a mismatched set.
#
# Sequence, chosen so the old release keeps serving traffic for as long as
# possible. The ordering is load-bearing:
#
#   1. pull all five images
#   2. run migrations with the NEW app image while the OLD containers still serve
#   3. swap all five containers over
#   4. health-check each component independently
#
# Do not reorder step 2 to "save time". Migrating after the swap means a
# migration failure takes the site down; migrating before it means a migration
# failure is discovered while the previous release is still answering.
#
# If any step fails, the previously recorded set of five is put back.
#
# NOTE ON MIGRATIONS: MySQL cannot roll back DDL, so a migration that fails
# midway can leave the schema partially changed and the rollback below will NOT
# undo it. Write migrations using the expand/contract pattern (add the new
# column, deploy, backfill, then drop the old one in a later release) so that
# every individual release is safe to roll back.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fixmate}"
COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE_OVERRIDE="${COMPOSE_OVERRIDE:-}"
RELEASE_FILE="${APP_DIR}/.current-release"
HISTORY_FILE="${APP_DIR}/.release-history"
IMAGE="${1:-}"

# The five components, in the order they are reported. The name is what appears
# in a failure, and "a deploy failed" is not an answer an operator can act on;
# "the admin front end never reported healthy" is.
COMPONENTS="app user-app worker-app admin-app super-admin-app"

# How long to wait for a component, in seconds.
#
# This is NOT the same as the health check's own interval and retries, and it has
# to exceed them. A front end's Docker health check uses interval 30s with 3
# retries, so it takes up to ~90 seconds of real time to report *unhealthy* -
# measured, not estimated. A wait shorter than that declares a failure before
# Docker has noticed one, and turns a slow start into a rollback.
COMPONENT_TIMEOUT="${COMPONENT_TIMEOUT:-180}"

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31mXXX %s\033[0m\n' "$*" >&2; exit 1; }



# APP_PORT and the four front-end ports are defined in .env, which only
# `docker compose` reads. Resolve them the same way compose does, otherwise the
# health check probes the wrong port - which for a front end means probing the
# wrong application and declaring a working release broken.
env_value() {
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env | tail -n 1 \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

# The reference for a sibling image: same registry, same owner, same tag, and a
# different last path segment.
#
#   ghcr.io/owner/fixmate/app:1.4.0 + user-app
#     -> ghcr.io/owner/fixmate/user-app:1.4.0
#
# Three cases, all of which occur in practice:
#
#   * a tagged reference, which is what the pipeline passes;
#   * an untagged reference (`.../app`), which means `:latest` — and without the
#     default below the tag expansion returns the *whole reference*, producing
#     `user-app:ghcr.io/owner/fixmate/app`, which is a name nothing can pull;
#   * a registry with a port (`localhost:5000/fixmate/app:2.0.0`), where the
#     colon in the host must not be mistaken for the tag separator.
sibling_image() {
    local name="$1" ref="$IMAGE" without_tag tag

    without_tag="${ref%:*}"
    if [ "$without_tag" = "$ref" ] || [ "${without_tag##*/}" = "${ref##*/}" ]; then
        # No tag: the last path segment swallowed the colon, or there was none.
        without_tag="$ref"
        tag="latest"
    else
        tag="${ref##*:}"
    fi

    printf '%s/%s:%s' "${without_tag%/*}" "$name" "$tag"
}

# The image for each component: the app's own, or a derived sibling.
image_for() {
    case "$1" in
        app) printf '%s' "$IMAGE" ;;
        user-app)        printf '%s' "${USER_APP_IMAGE:-$(sibling_image user-app)}" ;;
        worker-app)      printf '%s' "${WORKER_APP_IMAGE:-$(sibling_image worker-app)}" ;;
        admin-app)       printf '%s' "${ADMIN_APP_IMAGE:-$(sibling_image admin-app)}" ;;
        super-admin-app) printf '%s' "${SUPER_ADMIN_APP_IMAGE:-$(sibling_image super-admin-app)}" ;;
        *) die "unknown component '$1'" ;;
    esac
}

# Every image, exported so `docker compose` substitutes them. Exported as
# variables rather than passed with `-e` per call so that `compose ps` and any
# manual `docker compose` command in this environment resolve the same set.
export_release_images() {
    local component
    for component in $COMPONENTS; do
        case "$component" in
            app)               export APP_IMAGE="$(image_for app)" ;;
            user-app)          export USER_APP_IMAGE="$(image_for user-app)" ;;
            worker-app)        export WORKER_APP_IMAGE="$(image_for worker-app)" ;;
            admin-app)         export ADMIN_APP_IMAGE="$(image_for admin-app)" ;;
            super-admin-app)   export SUPER_ADMIN_APP_IMAGE="$(image_for super-admin-app)" ;;
        esac
    done
}

# The published port for a component, resolved from .env the way compose does.
port_for() {
    case "$1" in
        app)               env_value APP_PORT ;;
        user-app)          env_value USER_APP_PORT ;;
        worker-app)        env_value WORKER_APP_PORT ;;
        admin-app)         env_value ADMIN_APP_PORT ;;
        super-admin-app)   env_value SUPER_ADMIN_APP_PORT ;;
        *) die "unknown component '$1'" ;;
    esac
}

# The images are passed as environment variables so they win over whatever is
# left in .env. COMPOSE_OVERRIDE layers a host-specific compose file on top, if
# one exists.
compose() {
    export_release_images
    if [ -n "$COMPOSE_OVERRIDE" ] && [ -f "$COMPOSE_OVERRIDE" ]; then
        docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" "$@"
    else
        docker compose -f "$COMPOSE_FILE" "$@"
    fi
}

PREVIOUS_RELEASE=""
[ -f "$RELEASE_FILE" ] && PREVIOUS_RELEASE="$(cat "$RELEASE_FILE")"

# The recorded set, one `component=image` pair per line.
#
# Reading it back is tolerant of the single-line format an earlier release
# recorded, so a server upgrading from the old script still has something to roll
# back to. That matters more than it looks: the old format is a bare app image,
# and it is expanded here by pointing the same derivation at it rather than by a
# second implementation of the same rule. A second copy is how the two drift and
# a rollback quietly restores the wrong front ends.
load_previous() {
    [ -n "$PREVIOUS_RELEASE" ] || return 0

    if printf '%s' "$PREVIOUS_RELEASE" | grep -q '='; then
        printf '%s' "$PREVIOUS_RELEASE"
        return 0
    fi

    local saved="$IMAGE" component
    IMAGE="$PREVIOUS_RELEASE"
    for component in $COMPONENTS; do
        printf '%s=%s\n' "$component" "$(image_for "$component")"
    done
    IMAGE="$saved"
}

# Restore a recorded set. Every image, not just the app's: a back end that
# rolled back alone would be served by front ends built against a contract it no
# longer has, and nobody could sign in. That is the entire reason the record is a
# set rather than a string.
rollback_to() {
    local recorded="$1" component name value

    warn "Restoring the previously recorded set"
    if ! printf '%s' "$recorded" | grep -q '='; then
        die "The recorded release is not a set and cannot be restored automatically. Intervene manually."
    fi

    while IFS='=' read -r name value; do
        [ -n "$name" ] || continue
        case "$name" in
            app)               export APP_IMAGE="$value" ;;
            user-app)          export USER_APP_IMAGE="$value" ;;
            worker-app)        export WORKER_APP_IMAGE="$value" ;;
            admin-app)         export ADMIN_APP_IMAGE="$value" ;;
            super-admin-app)   export SUPER_ADMIN_APP_IMAGE="$value" ;;
            *) warn "Ignoring unknown component '${name}' in the release record" ;;
        esac
        component="$name"
    done <<< "$recorded"

    [ -n "${component:-}" ] || die "The release record is empty. Intervene manually."

    if ! docker compose -f "$COMPOSE_FILE" up -d --remove-orphans; then
        die "Rollback also failed. Intervene manually."
    fi

    warn "Restored. Check the database: migrations are not reverted automatically."
}

rollback() {
    warn "Deploy failed: $1"
    if [ -z "$PREVIOUS_RELEASE" ]; then
        warn "No previous release on record; leaving the current containers up for inspection."
        return 0
    fi
    rollback_to "$(load_previous)"
}

# Wait for one component, and say which one.
#
# Two things are checked and they are not the same question:
#
#   1. Does the container's own health check report healthy? That asks Docker
#      whether the process is doing its job.
#   2. Does the published address answer? That asks whether anything can reach
#      it. A container can be healthy and unreachable - wrong port published, a
#      firewall between, a port already taken by something else.
#
# The second is the one that catches "healthy inside the server but broken from
# outside", which is the failure user story 78 is about. Checking only the first
# would pass it.
wait_for_component() {
    local component="$1"
    # `attempt=0` is not optional. On bash 4.4 and later, arithmetic on an unset
    # variable is an error under `set -u` - "attempt: unbound variable" - so an
    # uninitialised counter aborts the script on the first poll that reaches it.
    # macOS ships bash 3.2, where the same expression quietly yields 1 and the
    # whole timeout path works, so this is invisible on a developer machine and
    # fatal on the VPS, which runs bash 5. Found by running the suite in a
    # bash:5 container rather than on the host.
    local port url deadline now attempt=0

    # 127.0.0.1, and that is the *host's* loopback, which is the only vantage
    # point that answers "can anything reach this" from the machine the deploy
    # runs on. It does mean the script has to run on the host, which is where it
    # runs. Run it inside a container and 127.0.0.1 is that container's own
    # loopback: every probe misses, the timeout is burned five times over, and
    # all five components are reported unreachable while they are demonstrably
    # serving. Observed rather than theorised - the container run that taught
    # this failed on `app` first, never reaching the front end that was
    # genuinely broken.
    port="$(port_for "$component")"
    [ -n "$port" ] || port="8080"
    url="http://127.0.0.1:${port}/up"

    local container
    container="$(compose ps -q "$component" 2>/dev/null || true)"

    log "Waiting for ${component} (${url})"
    deadline=$(( $(date +%s) + COMPONENT_TIMEOUT ))

    while :; do
        now="$(date +%s)"

        # 1. The container's own verdict, when it has one.
        if [ -n "$container" ]; then
            local state
            state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo unknown)"

            if [ "$state" = "exited" ] || [ "$state" = "dead" ]; then
                return 2
            fi

            if [ "$state" = "unhealthy" ]; then
                warn "${component}: its container reports unhealthy"
            fi
        fi

        # 2. The address answering. This is the check that decides.
        if curl --fail --silent --show-error --max-time 5 "$url" >/dev/null 2>&1; then
            log "${component} is serving on ${port}"
            return 0
        fi

        if [ "$now" -ge "$deadline" ]; then
            warn "${component}: ${url} did not answer within ${COMPONENT_TIMEOUT}s"
            return 1
        fi

        attempt=$(( attempt + 1 ))
        [ $(( attempt % 5 )) -eq 0 ] && warn "${component}: still waiting (${attempt} attempts)"
        sleep 2
    done
}

# Registry credentials come from the VPS .env, never from the pipeline, so the
# production box holds the only copy of the pull token. The daemon caches them, so
# later manual `docker compose` commands keep working without a re-login.
registry_host() {
    local ref="${IMAGE#*://}"
    printf '%s' "${ref%%/*}"
}

registry_login() {
    local user token
    user="$(env_value REGISTRY_USER)"
    token="$(env_value REGISTRY_TOKEN)"

    if [ -z "$user" ] || [ -z "$token" ]; then
        return 0
    fi

    log "Authenticating to the registry as ${user}"
    if ! printf '%s' "$token" | docker login "$(registry_host)" --username "$user" --password-stdin; then
        die "Could not authenticate to $(registry_host). Check REGISTRY_USER and REGISTRY_TOKEN in ${APP_DIR}/.env."
    fi
}

# The script is also sourced by deploy/test-deploy.sh, which needs the functions
# below without any of the side effects. Sourcing stops here; running does not.
# Without this, `bash deploy/deploy.sh` and a test harness would need two copies
# of the derivation, and a second copy is how they drift.
if [ "${FIXMATE_SOURCE_ONLY:-0}" = "1" ]; then
    return 0
fi

[ -n "$IMAGE" ] || die "usage: $0 <app-image-reference>"
[ -d "$APP_DIR" ] || die "APP_DIR ${APP_DIR} does not exist"
cd "$APP_DIR"

for cmd in docker curl; do
    command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is not installed on this host."
done
docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin is not installed."

[ -f .env ]            || die "${APP_DIR}/.env is missing. Copy deploy/env.example and fill it in."
[ -f "$COMPOSE_FILE" ] || die "${APP_DIR}/${COMPOSE_FILE} is missing. The pipeline should rsync it."

# ---------------------------------------------------------------------------
# The set being deployed
# ---------------------------------------------------------------------------
export_release_images

log "Deploying this set of five:"
for component in $COMPONENTS; do
    printf '    %-18s %s\n' "$component" "$(image_for "$component")"
done

registry_login

# 1. Pull all five ------------------------------------------------------------
# Every image is pulled before anything starts. A pull failure here is cheap:
# nothing has changed yet. The same failure after the swap would have taken the
# release down.
log "Pulling all five images"
if ! compose pull --quiet; then
    rollback "could not pull the set"
    if [ -z "$(env_value REGISTRY_USER)" ]; then
        die "The set could not be pulled, and no registry credentials are configured. If the packages are private, set REGISTRY_USER and REGISTRY_TOKEN in ${APP_DIR}/.env."
    fi
    die "The set could not be pulled. Are all five pushed, and does REGISTRY_TOKEN have read:packages?"
fi

# 2. Migrate (new code, old containers still serving) ------------------------
# With the NEW app image, while the OLD containers still answer. See the header:
# this ordering is what makes a migration failure recoverable.
log "Running migrations with the new app image, while the old release still serves"
if ! compose run --rm -T app php artisan migrate --force --no-interaction; then
    rollback "migrations failed"
    die "Migrations failed. Schema may be partially migrated - inspect before retrying."
fi

# 3. Swap all five ------------------------------------------------------------
log "Starting all five components"
if ! compose up -d --remove-orphans; then
    rollback "containers failed to start"
    die "Could not start the new set."
fi

# 4. Verify each independently ------------------------------------------------
# One at a time, each naming itself, so a failure identifies the component rather
# than reporting a general failure the operator then has to diagnose.
log "Health-checking each component"
for component in $COMPONENTS; do
    # Written as `if cmd; then continue; fi` rather than `if ! cmd; then status=$?`.
    # The `!` inverts the exit status, so `$?` read inside that block is 0 - always
    # 0 - and the "exited" branch below could never be taken. A container that died
    # on startup was reported as merely "not serving", which is the vaguer of the
    # two messages and the one that sends an operator looking in the wrong place.
    if wait_for_component "$component"; then
        continue
    fi
    status=$?

    log "Recent logs for ${component}"
    compose logs --tail 50 "$component" || true

    if [ "$status" = "2" ]; then
        rollback "${component} exited during startup"
        die "${component} exited. The release was rolled back."
    fi

    rollback "${component} never reported healthy"
    die "${component} is not serving. The release was rolled back."
done

# Confirm the app can actually reach the database, not just serve a 200. The
# front ends have no equivalent: they are static files and talk to nothing.
log "Verifying database connectivity"
if ! compose exec -T app php artisan migrate:status --no-interaction >/dev/null; then
    rollback "database connectivity check failed"
    die "The new release cannot talk to MySQL."
fi

# ---------------------------------------------------------------------------
# Record the set
# ---------------------------------------------------------------------------
# Five lines, not one. The next deploy reads this to know what to restore, and an
# operator reads it to answer what is running right now.
{
    for component in $COMPONENTS; do
        printf '%s=%s\n' "$component" "$(image_for "$component")"
    done
} > "$RELEASE_FILE"

{
    printf -- '--- %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    for component in $COMPONENTS; do
        printf '%s=%s\n' "$component" "$(image_for "$component")"
    done
} >> "$HISTORY_FILE"

log "Deployed. The five versions now live are:"
compose ps
