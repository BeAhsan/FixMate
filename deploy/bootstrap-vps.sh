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
# 1b. rsync
# ---------------------------------------------------------------------------
# The Jenkins Deploy stage copies the orchestration files here with rsync, which
# needs it installed on both ends. The controller image happens to bundle it; a
# host does not. Without it the build dies with
#
#     rsync: connection unexpectedly closed (0 bytes received so far) [sender]
#     rsync error: error in rsync protocol data stream (code 12)
#
# which does not mention rsync anywhere, so the cost of not installing it here
# is a confusing failure on the first deploy rather than a clear one now.
if ! command -v rsync >/dev/null 2>&1; then
    log "Installing rsync"
    if command -v apt-get >/dev/null 2>&1; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq rsync
    fi
    command -v rsync >/dev/null 2>&1 \
        || die "rsync is required for Jenkins deploys: apt-get install -y rsync"
fi

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
    #
    # Takes an optional second argument naming the file to read, which lets the
    # registry credentials be read out of env.example before that file has been
    # copied into place as .env. With one argument the behaviour is the same as
    # deploy.sh's.
    local file="${2:-$ENV_FILE}"
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$file" | tail -n 1 \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

generate_app_key() {
    # The key has to come from the real image so that it is produced by the same
    # PHP build that will use it. Returns non-zero, rather than dying, so the
    # caller decides whether a missing key is fatal - which it is.
    local key
    log "Generating APP_KEY from ${IMAGE}"
    key="$(docker run --rm -u 0 --pull=always "$IMAGE" \
            php artisan key:generate --show 2>/dev/null | tail -n 1)" || return 1
    case "$key" in
        base64:*) set_env APP_KEY "$key"; return 0 ;;
        *)        return 1 ;;
    esac
}

# ---------------------------------------------------------------------------
# 4. Registry
# ---------------------------------------------------------------------------
# Log in before anything that needs the image, and pull it, before generating
# the app key. This ordering is the whole point: the key is produced by running
# the image, so authenticating afterwards is useless for a private package - the
# pull has already failed by then, and the run that needs the key cannot
# succeed. Authenticating first is what makes a private image work here at all.
#
# Credentials come from .env when it exists, otherwise from the env.example
# about to be installed as .env. The second case is how they get seeded for a
# first run: uncomment the two lines in deploy/env.example before copying it
# across, and they are picked up here.
log "Checking that ${IMAGE} can be pulled"

CRED_FILE="$ENV_FILE"
[ -f "$CRED_FILE" ] || CRED_FILE="$APP_DIR/deploy/env.example"

REG_USER="$(env_value REGISTRY_USER "$CRED_FILE")"
REG_TOKEN="$(env_value REGISTRY_TOKEN "$CRED_FILE")"
REG_HOST="${IMAGE#*://}"
REG_HOST="${REG_HOST%%/*}"

if [ -n "$REG_USER" ] && [ -n "$REG_TOKEN" ]; then
    log "Authenticating to ${REG_HOST} as ${REG_USER}"
    if ! printf '%s' "$REG_TOKEN" | docker login "$REG_HOST" --username "$REG_USER" --password-stdin >/dev/null 2>&1; then
        warn "Could not authenticate to ${REG_HOST}. Check REGISTRY_USER and REGISTRY_TOKEN in ${CRED_FILE}."
    fi
elif [ "$CRED_FILE" = "$ENV_FILE" ]; then
    warn "No registry credentials in ${ENV_FILE}."
fi

IMAGE_PULLABLE=0
if docker pull --quiet "$IMAGE" >/dev/null 2>&1; then
    log "Image is available and pulled"
    IMAGE_PULLABLE=1
else
    warn "Could not pull ${IMAGE}."
    if [ -z "$REG_USER" ] || [ -z "$REG_TOKEN" ]; then
        warn "No registry credentials are set and the package looks private."
        warn "For a private image, add these to ${ENV_FILE} and run this again:"
        warn "    REGISTRY_USER=<github username>"
        warn "    REGISTRY_TOKEN=<token with read:packages>"
    else
        warn "Credentials are set but the pull still failed. Check the token has read:packages."
    fi
fi

# ---------------------------------------------------------------------------
# 5. Environment file
# ---------------------------------------------------------------------------
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
fi

# Generated here rather than inside the branch above, so a re-run repairs a .env
# that was written by an earlier attempt which could not reach the image. Without
# this, the one-time failure is permanent: every later run skips the whole block
# because the file exists, and the key is never filled in.
if [ -z "$(env_value APP_KEY)" ]; then
    generate_app_key || warn "Could not run ${IMAGE} to generate a key."
fi

chmod 600 "$ENV_FILE"

# ---------------------------------------------------------------------------
# 5b. The deploy user
# ---------------------------------------------------------------------------
# Everything above runs as root, because installing Docker and pulling an image
# needs it. The deploy path does not: Jenkins SSHes in as a normal user, rsyncs
# the orchestration files into APP_DIR, and runs deploy.sh there. So the user who
# invoked this script is given the two things that path needs.
#
# Without the group, deploy.sh dies on "permission denied while trying to connect
# to the Docker daemon socket". Without the ownership, rsync dies with
# "Permission denied (13)" on the first file it writes. Both read like pipeline
# faults, and neither is, so they are fixed here where the cause is visible.
#
# Membership takes effect at the next login. An SSH session is a new login, so
# the next deploy gets it without anyone having to sign out of anything.
DEPLOY_USER="${SUDO_USER:-}"
if [ -n "$DEPLOY_USER" ] && [ "$DEPLOY_USER" != "root" ] && id "$DEPLOY_USER" >/dev/null 2>&1; then
    if id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx docker; then
        log "${DEPLOY_USER} is already in the docker group"
    else
        log "Adding ${DEPLOY_USER} to the docker group"
        usermod -aG docker "$DEPLOY_USER"
    fi
    log "Handing ${APP_DIR} to ${DEPLOY_USER}"
    chown -R "$DEPLOY_USER":"$(id -gn "$DEPLOY_USER")" "$APP_DIR"
else
    warn "SUDO_USER is unset or root, so the deploy user was not set up."
    warn "A Jenkins deploy needs both of these on the target:"
    warn "    usermod -aG docker <deploy-user>"
    warn "    chown -R <deploy-user> ${APP_DIR}"
fi

# ---------------------------------------------------------------------------
# 6. Verify
# ---------------------------------------------------------------------------
# A missing APP_KEY means Laravel throws on every request. It is the one failure
# that makes the server unusable while looking like a successful setup, so it is
# checked here rather than discovered by the first deploy or the first visitor.
if [ -z "$(env_value APP_KEY)" ]; then
    die "$(cat <<EOF
APP_KEY is empty in ${ENV_FILE}, and the application cannot boot without it.
Refusing to report the server as ready.

${IMAGE} could not be run, so the key could not be generated. Most likely the
package is private and this server cannot pull it yet. Add the credentials and
run this script again - it will log in, pull, and fill the key in:

    REGISTRY_USER=<github username>
    REGISTRY_TOKEN=<token with read:packages>

If you would rather not re-run the whole script, generate the key directly:

    docker run --rm -u 0 --pull=always ${IMAGE} php artisan key:generate --show

and write the result into ${ENV_FILE} as APP_KEY=... (note the base64: prefix).
EOF
)"
fi

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
APP_PORT_EFFECTIVE="$(env_value APP_PORT)"
APP_URL_EFFECTIVE="$(env_value APP_URL)"

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
    bash "$APP_DIR/deploy/deploy.sh" "$IMAGE"
fi
