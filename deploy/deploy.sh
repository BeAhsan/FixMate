#!/usr/bin/env bash
#
# Production deploy. Executed on the target VPS by the Jenkins pipeline:
#
#   ./deploy/deploy.sh ghcr.io/owner/fixmate/app:1.4.0
#
# Sequence, chosen so the old release keeps serving traffic for as long as
# possible:
#
#   1. pull the new image
#   2. run migrations with the NEW image while the OLD containers still serve
#   3. swap the containers over
#   4. wait for the health endpoint
#
# If any step fails, the previously recorded image is put back and the old
# containers are restarted.
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
IMAGE="${1:-}"

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31mXXX %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$IMAGE" ] || die "usage: $0 <image-reference>"
[ -d "$APP_DIR" ] || die "APP_DIR ${APP_DIR} does not exist"
cd "$APP_DIR"

for cmd in docker curl; do
    command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is not installed on this host."
done
docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin is not installed."

[ -f .env ]            || die "${APP_DIR}/.env is missing. Copy deploy/env.example and fill it in."
[ -f "$COMPOSE_FILE" ] || die "${APP_DIR}/${COMPOSE_FILE} is missing. The pipeline should rsync it."

# The image is passed as an env var so it wins over any APP_IMAGE left in .env.
# COMPOSE_OVERRIDE layers a host-specific compose file on top, if one exists.
compose_with() {
    local image="$1"; shift
    if [ -n "$COMPOSE_OVERRIDE" ] && [ -f "$COMPOSE_OVERRIDE" ]; then
        APP_IMAGE="$image" docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" "$@"
    else
        APP_IMAGE="$image" docker compose -f "$COMPOSE_FILE" "$@"
    fi
}
compose() { compose_with "$IMAGE" "$@"; }

PREVIOUS_IMAGE=""
[ -f "$RELEASE_FILE" ] && PREVIOUS_IMAGE="$(cat "$RELEASE_FILE")"

rollback() {
    warn "Deploy failed: $1"
    if [ -z "$PREVIOUS_IMAGE" ]; then
        warn "No previous release on record; leaving the current containers up for inspection."
        return 0
    fi

    warn "Restoring previous image ${PREVIOUS_IMAGE}"
    if ! compose_with "$PREVIOUS_IMAGE" up -d --remove-orphans; then
        die "Rollback to ${PREVIOUS_IMAGE} also failed. Intervene manually."
    fi
    warn "Rolled back to ${PREVIOUS_IMAGE}."
    warn "Check the database: migrations are not reverted automatically."
}

# APP_PORT is defined in .env, which only `docker compose` reads. Resolve it the
# same way compose does, otherwise the health check probes the wrong port.
env_value() {
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env | tail -n 1 \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

wait_for_health() {
    local port="${APP_PORT:-$(env_value APP_PORT)}"
    port="${port:-8080}"
    local attempts="${HEALTH_RETRIES:-30}"
    local url="http://127.0.0.1:${port}/up"

    log "Waiting for ${url} to report healthy"
    local i
    for ((i = 1; i <= attempts; i++)); do
        if curl --fail --silent --show-error --max-time 5 "$url" >/dev/null 2>&1; then
            log "Healthy after ${i} attempt(s)"
            return 0
        fi
        sleep 2
    done
    return 1
}

# 1. Authenticate and pull ---------------------------------------------------
# The image may sit in a private registry. Credentials come from the VPS .env,
# never from the pipeline, so the production box holds the only copy of the
# pull token. The daemon caches them, so later manual `docker compose` commands
# keep working without a re-login.
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

# ghcr.io/beahsan/fixmate/app:tag -> ghcr.io
# Done with shell expansion rather than sed: the optional-scheme pattern needs
# a GNU extension that BSD sed does not have.
registry_host() {
    local ref="${IMAGE#*://}"
    printf '%s' "${ref%%/*}"
}

registry_login

log "Pulling ${IMAGE}"
if ! compose pull --quiet; then
    rollback "could not pull ${IMAGE}"
    if [ -z "$(env_value REGISTRY_USER)" ]; then
        die "Image ${IMAGE} could not be pulled, and no registry credentials are configured. If the package is private, set REGISTRY_USER and REGISTRY_TOKEN in ${APP_DIR}/.env."
    fi
    die "Image ${IMAGE} could not be pulled. Is it pushed, and does REGISTRY_TOKEN have read:packages?"
fi

# 2. Migrate (new code, old containers still serving) -----------------------
log "Running migrations with ${IMAGE}"
if ! compose run --rm -T app php artisan migrate --force --no-interaction; then
    rollback "migrations failed"
    die "Migrations failed. Schema may be partially migrated - inspect before retrying."
fi

# 3. Swap -------------------------------------------------------------------
log "Starting ${IMAGE}"
if ! compose up -d --remove-orphans; then
    rollback "containers failed to start"
    die "Could not start the new release."
fi

# 4. Verify -----------------------------------------------------------------
if ! wait_for_health; then
    log "Recent app logs"
    compose logs --tail 50 app || true
    rollback "health check never passed"
    die "Health check failed for ${IMAGE}."
fi

# Confirm the app can actually reach the database, not just serve a 200.
log "Verifying database connectivity"
if ! compose exec -T app php artisan migrate:status --no-interaction >/dev/null; then
    rollback "database connectivity check failed"
    die "The new release cannot talk to MySQL."
fi

printf '%s' "$IMAGE" > "$RELEASE_FILE"
printf '%s\n' "$IMAGE" >> "${APP_DIR}/.release-history"

log "Deployed ${IMAGE}"
compose ps
