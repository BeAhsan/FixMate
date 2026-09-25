#!/usr/bin/env bash
#
# One-time preparation of a production VPS. Run this by hand exactly once per
# server; every deploy after that is Jenkins' job.
#
#   bash ./deploy/bootstrap-vps.sh --url https://fixmate.example.com
#
# Run it through bash explicitly rather than as ./deploy/bootstrap-vps.sh. The
# executable bit does not survive every copy method, and a script that cannot be
# run the way its own help text tells you to run it is a bad first impression.
#
# It is deliberately idempotent and deliberately refuses to touch an existing
# .env, because the pipeline treats that file as the one piece of state it
# never overwrites. Re-running after a partial failure is always safe.
#
# What it does:
#   1. installs Docker and the Compose plugin if they are missing
#   2. creates /opt/fixmate
#   3. copies the compose file and deploy/ into it
#   4. writes .env with a generated app key and generated database passwords
#
# It does NOT deploy. Run deploy.sh (or Jenkins) once the .env is in place.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fixmate}"
IMAGE="${BOOTSTRAP_IMAGE:-ghcr.io/beahsan/fixmate/app:latest}"
APP_URL=""
APP_PORT=""
REPO_URL=""
DO_DEPLOY=0

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SELF="${SCRIPT_DIR}/$(basename "$0")"

# Options are collected into an array so they survive the re-exec under sudo
# intact. Rebuilding the command line by hand would mangle any value
# containing a space.
PASSTHROUGH=()

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31mXXX %s\033[0m\n' "$*" >&2; exit 1; }
usage() {
    sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

while [ $# -gt 0 ]; do
    case "$1" in
        --image)  IMAGE="$2";     PASSTHROUGH+=(--image "$2"); shift 2 ;;
        --url)    APP_URL="$2";   PASSTHROUGH+=(--url "$2");   shift 2 ;;
        --port)   APP_PORT="$2";  PASSTHROUGH+=(--port "$2");  shift 2 ;;
        --dir)    APP_DIR="$2";   PASSTHROUGH+=(--dir "$2");   shift 2 ;;
        --repo)   REPO_URL="$2";  PASSTHROUGH+=(--repo "$2");  shift 2 ;;
        --deploy) DO_DEPLOY=1;    PASSTHROUGH+=(--deploy);     shift ;;
        -h|--help) usage 0 ;;
        *) die "unknown option: $1 (try --help)" ;;
    esac
done

# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------
# Every step below writes outside a normal user's home and manages services, so
# re-exec under sudo rather than making the caller remember it.
if [ "$(id -u)" -ne 0 ]; then
    log "Re-running under sudo"
    # Explicitly re-invoked through bash rather than run as "$SELF". Executing
    # the path directly would need the executable bit, and this script gets
    # copied to places that quietly drop it - an scp without -p, a git
    # archive, a paste through a Windows share. Being unreadable-as-a-program
    # is not a reason to fail, so the interpreter is named explicitly and the
    # bit stops mattering.
    exec sudo env "APP_DIR=$APP_DIR" "BOOTSTRAP_IMAGE=$IMAGE" \
        bash "$SELF" ${PASSTHROUGH+"${PASSTHROUGH[@]}"}
fi

command -v bash >/dev/null 2>&1 || die "bash is required but not installed."
command -v curl >/dev/null 2>&1 || die "curl is required. Install it with: apt-get install -y curl"

# ---------------------------------------------------------------------------
# 1. Docker
# ---------------------------------------------------------------------------
install_docker() {
    log "Installing Docker"
    if command -v apt-get >/dev/null 2>&1; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq curl ca-certificates
        curl -fsSL https://get.docker.com | sh
    else
        warn "No apt-get found. Install Docker manually, then re-run this script."
        die "https://docs.docker.com/engine/install/"
    fi
}

if ! command -v docker >/dev/null 2>&1; then
    install_docker
fi

# The compose plugin is a separate package on some distributions even when the
# docker CLI is present, and deploy.sh cannot run without it.
if ! docker compose version >/dev/null 2>&1; then
    log "Installing the Docker Compose plugin"
    if command -v apt-get >/dev/null 2>&1; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq docker-compose-plugin
    fi
    docker compose version >/dev/null 2>&1 \
        || die "The Docker Compose plugin is missing: https://docs.docker.com/compose/install/"
fi

log "Docker $(docker version --format '{{.Server.Version}}') and Compose $(docker compose version --short) are ready"

# ---------------------------------------------------------------------------
# 2. Application directory
# ---------------------------------------------------------------------------
mkdir -p "$APP_DIR"

# ---------------------------------------------------------------------------
# 3. Orchestration files
# ---------------------------------------------------------------------------
# Two ways in: run this script from a checkout, or let it clone one. The
# checkout is preferred because it is whatever you have actually been testing.
if [ ! -f "$SOURCE_DIR/docker-compose.prod.yml" ]; then
    if [ -n "$REPO_URL" ]; then
        command -v git >/dev/null 2>&1 || die "git is required to clone the repository."
        log "Cloning ${REPO_URL}"
        git clone --depth 1 "$REPO_URL" "$APP_DIR"
        SOURCE_DIR="$APP_DIR"
    else
        # Name the file that is actually absent and give both remedies as
        # commands that can be pasted as-is. A bare "pass --repo" sends the
        # reader back to the source to work out which file was left behind.
        die "$(cat <<EOF
${SOURCE_DIR}/docker-compose.prod.yml is missing, so there is no orchestration
file to install. The deploy/ directory alone is not enough - this script copies
the compose file and the deploy/ directory side by side into ${APP_DIR}.

Copy the compose file across next to deploy/ and run this again:

    scp -rp docker-compose.prod.yml deploy <user>@<host>:/tmp/

Or let the script fetch a checkout itself, instead of copying files:

    bash ./deploy/bootstrap-vps.sh --repo <git-url> --url <app-url>
EOF
)"
    fi
else
    log "Installing orchestration files into ${APP_DIR}"
    cp "$SOURCE_DIR/docker-compose.prod.yml" "$APP_DIR/"
    rm -rf "${APP_DIR}/deploy"
    cp -R "$SOURCE_DIR/deploy" "$APP_DIR/"
    chmod +x "$APP_DIR"/deploy/*.sh
fi

[ -f "$APP_DIR/docker-compose.prod.yml" ] || die "docker-compose.prod.yml is missing from ${APP_DIR}."

# ---------------------------------------------------------------------------
# 4. Environment file
# ---------------------------------------------------------------------------
ENV_FILE="${APP_DIR}/.env"

set_env() {
    # Rewrite a key if it is already present, otherwise append it. Values are
    # alphanumeric only, so neither the sed replacement nor .env parsing can be
    # tripped up by a separator character.
    local key="$1" value="$2" tmp
    if grep -qE "^[[:space:]]*${key}=" "$ENV_FILE"; then
        tmp="$(mktemp)"
        sed "s|^[[:space:]]*${key}=.*|${key}=${value}|" "$ENV_FILE" > "$tmp"
        cat "$tmp" > "$ENV_FILE"
        rm -f "$tmp"
    else
        printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    fi
}

random_secret() {
    # Alphanumeric only: safe in a .env file, in a URL, and in a shell.
    LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32
}

env_value() {
    # Deliberately identical to the one in deploy.sh. A single .env is read by
    # both scripts, so the two must agree on what a value is: surrounding
    # whitespace and one layer of matching quotes are not part of it. Without
    # that, a stray carriage return - which scp-ing an edited file or writing
    # through a pty will happily introduce - becomes part of a token, and the
    # failure surfaces as an authentication error against a value that looks
    # correct on screen.
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -n 1 \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

if [ -f "$ENV_FILE" ]; then
    warn "${ENV_FILE} already exists and was left untouched."
    warn "Delete it first if you really want a fresh one."
else
    log "Writing ${ENV_FILE}"
    cp "$APP_DIR/deploy/env.example" "$ENV_FILE"

    set_env APP_PORT "${APP_PORT:-8080}"
    set_env APP_URL  "${APP_URL:-http://localhost:${APP_PORT:-8080}}"
    set_env DB_PASSWORD       "$(random_secret)"
    set_env DB_ROOT_PASSWORD  "$(random_secret)"

    # The key has to come from the real image so it is generated by the same
    # PHP build that will use it. If the image is not in the registry yet this
    # is not fatal - it is filled in below, or by hand afterwards.
    log "Generating APP_KEY from ${IMAGE}"
    if APP_KEY="$(docker run --rm -u 0 --pull=always "$IMAGE" \
                    php artisan key:generate --show 2>/dev/null | tail -n 1)"; then
        case "$APP_KEY" in
            base64:*) set_env APP_KEY "$APP_KEY" ;;
            *) warn "The image did not return a key; leaving APP_KEY empty." ;;
        esac
    else
        warn "Could not run ${IMAGE} to generate a key."
        warn "Push the image first, then fill APP_KEY in by hand:"
        warn "  docker run --rm -u 0 ${IMAGE} php artisan key:generate --show"
    fi
fi

chmod 600 "$ENV_FILE"

# ---------------------------------------------------------------------------
# 4b. Preflight
# ---------------------------------------------------------------------------
# Prove the release can actually be fetched before declaring victory. A private
# package with no credentials is the most likely failure here, and it is much
# cheaper to find now than halfway through a deploy.
log "Checking that ${IMAGE} can be pulled"

REG_USER="$(env_value REGISTRY_USER)"
REG_TOKEN="$(env_value REGISTRY_TOKEN)"
REG_HOST="${IMAGE#*://}"
REG_HOST="${REG_HOST%%/*}"

if [ -n "$REG_USER" ] && [ -n "$REG_TOKEN" ]; then
    printf '%s' "$REG_TOKEN" | docker login "$REG_HOST" --username "$REG_USER" --password-stdin >/dev/null 2>&1 \
        || warn "Could not authenticate to ${REG_HOST}; check REGISTRY_USER and REGISTRY_TOKEN."
fi

if docker pull --quiet "$IMAGE" >/dev/null 2>&1; then
    log "Image is available and pulled"
else
    warn "Could not pull ${IMAGE}."
    if [ -z "$REG_USER" ] || [ -z "$REG_TOKEN" ]; then
        warn "No registry credentials are set and the package looks private."
        warn "Either make the package public, or add these to ${ENV_FILE} and re-run:"
        warn "    REGISTRY_USER=<github username>"
        warn "    REGISTRY_TOKEN=<token with read:packages>"
    else
        warn "Credentials are set but the pull still failed. Check the token has read:packages."
    fi
    warn "Continuing anyway - deploy.sh will report this again."
fi

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
APP_PORT_EFFECTIVE="$(sed -n 's/^APP_PORT=//p' "$ENV_FILE" | tail -n 1)"
APP_URL_EFFECTIVE="$(sed -n 's/^APP_URL=//p' "$ENV_FILE" | tail -n 1)"

cat <<EOF

$(printf '\033[1;32m==> The server is ready.\033[0m')

  App directory   ${APP_DIR}
  Published port  ${APP_PORT_EFFECTIVE:-8080}
  App URL         ${APP_URL_EFFECTIVE:-unset}

  The database password was generated for you. Read it back with:

    sudo grep -E '^(DB_PASSWORD|DB_ROOT_PASSWORD)=' ${ENV_FILE}

  Deploy the first release with:

    cd ${APP_DIR} && sudo bash ./deploy/deploy.sh ${IMAGE}

  Then check it answered:

    curl -i http://<this-host>:${APP_PORT_EFFECTIVE:-8080}/up

EOF

if [ "$DO_DEPLOY" -eq 1 ]; then
    log "Deploying ${IMAGE}"
    "$APP_DIR/deploy/deploy.sh" "$IMAGE"
fi
