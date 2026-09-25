#!/usr/bin/env bash
#
# One-time preparation of the Jenkins controller machine. Run this by hand
# exactly once per controller; the pipeline then maintains itself.
#
#   bash deploy/jenkins/setup-controller.sh
#
# It is idempotent. The first run installs Docker, fetches a checkout and
# creates the secrets directory, then stops and tells you what is still
# missing. Add the secrets, run it again, and it starts the controller and
# waits for it to report healthy.
#
# Why two runs rather than one: the credentials cannot be invented. Rather
# than starting a controller with no job configured, it stops at the point
# where a human has to type something, and picks up from there.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_DIR="${REPO_DIR:-/opt/fixmate-ci}"
JENKINS_PORT="${JENKINS_PORT:-8080}"

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31mXXX %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Re-exec under sudo
# ---------------------------------------------------------------------------
# Every step below installs packages, manages a service and writes outside a
# normal user's home. Invoked through bash explicitly rather than as "$SELF",
# because the executable bit does not survive every copy method and a script
# that cannot be run the way its own help text says is a bad first impression.
if [ "$(id -u)" -ne 0 ]; then
    log "Re-running under sudo"
    PASSTHROUGH=()
    while [ $# -gt 0 ]; do
        PASSTHROUGH+=("$1")
        shift
    done
    exec sudo env "REPO_DIR=$REPO_DIR" "JENKINS_PORT=$JENKINS_PORT" \
        bash "$SCRIPT_DIR/$(basename "$0")" ${PASSTHROUGH+"${PASSTHROUGH[@]}"}
fi

command -v bash >/dev/null 2>&1 || die "bash is required but is not installed."

# ---------------------------------------------------------------------------
# 2. Docker and git
# ---------------------------------------------------------------------------
# Docker is not optional here: the controller itself runs as a container, and
# the pipeline builds and pushes images through the socket it mounts.
if ! command -v docker >/dev/null 2>&1; then
    log "Installing Docker"
    command -v apt-get >/dev/null 2>&1 || die "No apt-get. Install Docker manually, then re-run."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl ca-certificates
    curl -fsSL https://get.docker.com | sh
fi

# The compose plugin is a separate package on some distributions even when the
# docker CLI is present, and the controller will not start without it.
if ! docker compose version >/dev/null 2>&1; then
    log "Installing the Docker Compose plugin"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq docker-compose-plugin
fi
docker compose version >/dev/null 2>&1 \
    || die "The Docker Compose plugin is missing: https://docs.docker.com/compose/install/"

if ! command -v git >/dev/null 2>&1; then
    log "Installing git"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq git
fi

log "Docker $(docker version --format '{{.Server.Version}}'), Compose $(docker compose version --short), $(git --version)"

# ---------------------------------------------------------------------------
# 3. Checkout
# ---------------------------------------------------------------------------
# Only deploy/jenkins/ is needed from here: the compose file, the controller
# Dockerfile, the plugin list, the init scripts and the secrets directory. The
# pipeline checks the repository out itself at build time, so a full clone of
# the application is not required.
if [ -d "$REPO_DIR/.git" ]; then
    log "Updating ${REPO_DIR}"
    git -C "$REPO_DIR" pull --ff-only --quiet
else
    command -v git >/dev/null 2>&1 || die "git is required to fetch the repository."
    REPO_URL="${REPO_URL:-https://github.com/BeAhsan/FixMate.git}"
    log "Cloning ${REPO_URL} into ${REPO_DIR}"
    mkdir -p "$(dirname "$REPO_DIR")"
    git clone --depth 1 "$REPO_URL" "$REPO_DIR"
fi

JENKINS_DIR="$REPO_DIR/deploy/jenkins"
[ -f "$JENKINS_DIR/docker-compose.yml" ] \
    || die "deploy/jenkins/docker-compose.yml is missing from ${REPO_DIR}."

# ---------------------------------------------------------------------------
# 4. Secrets
# ---------------------------------------------------------------------------
SECRETS_DIR="$JENKINS_DIR/secrets"
CONFIG="$SECRETS_DIR/config"

mkdir -p "$SECRETS_DIR"

if [ ! -f "$CONFIG" ]; then
    log "Writing ${CONFIG} from the template"
    cp "$SECRETS_DIR/config.example" "$CONFIG"
    chmod 600 "$CONFIG"
    warn "It is a copy of config.example, so every value still needs checking."
    warn "At minimum DEPLOY_HOST, DEPLOY_USER and PLATFORM."
fi

# config_value KEY - last assignment wins, matching how the init script reads it.
config_value() {
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$CONFIG" | tail -n 1 \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

# The secret files the init script looks for. Missing ones are not fatal to the
# controller booting - it comes up without a job and can be configured by hand -
# but a pipeline with no credentials is not going to build or deploy anything,
# so they are treated as blocking here.
REQUIRED_SECRETS="registry-user registry-token ssh-key known-hosts"
MISSING=""
for name in $REQUIRED_SECRETS; do
    [ -s "$SECRETS_DIR/$name" ] || MISSING="$MISSING $name"
done

# A config still carrying template placeholders is as useless as a missing file,
# and fails later, further from the cause.
DEPLOY_HOST_EFFECTIVE="$(config_value DEPLOY_HOST)"
DEPLOY_USER_EFFECTIVE="$(config_value DEPLOY_USER)"
PLATFORM_EFFECTIVE="$(config_value PLATFORM)"
REPO_URL_EFFECTIVE="$(config_value REPO_URL)"
IMAGE_REPO_EFFECTIVE="$(config_value IMAGE_REPO)"

[ -n "$DEPLOY_HOST_EFFECTIVE" ] || { MISSING="$MISSING (DEPLOY_HOST is unset in config)"; }
[ -n "$IMAGE_REPO_EFFECTIVE" ] || { MISSING="$MISSING (IMAGE_REPO is unset in config)"; }

if [ -n "$MISSING" ]; then
    cat >&2 <<EOF

$(printf '\033[1;31mXXX Not starting the controller yet.\033[0m')

  Still needed in ${SECRETS_DIR}:${MISSING}

  Two kinds of thing are missing.

  Fill in ${CONFIG} - it is a copy of config.example, so the values that
  matter are DEPLOY_HOST, DEPLOY_USER, PLATFORM and REPO_URL.

  Then create a file for each secret, named exactly:

    registry-user    your GitHub username
    registry-token   a token with write:packages
    ssh-key          the private key Jenkins uses to reach the deploy host
    known-hosts      ssh-keyscan -H <DEPLOY_HOST> > known-hosts

  The ssh-key and known-hosts pair is what stops the pipeline from trusting
  whatever answers on that address. Generate them on this machine:

    ssh-keygen -t ed25519 -N '' -f ~/.ssh/fixmate_deploy
    ssh-keyscan -H ${DEPLOY_HOST_EFFECTIVE:-<DEPLOY_HOST>} > ${SECRETS_DIR}/known-hosts

    and add the public half to ~/.ssh/authorized_keys on the deploy host.

  Then run this script again. It will start the controller and wait for it.

EOF
    exit 1
fi

# ---------------------------------------------------------------------------
# 5. Start
# ---------------------------------------------------------------------------
log "Starting the controller"
cd "$JENKINS_DIR"
docker compose up -d --build

log "Waiting for Jenkins to report healthy"
# Must outlast the container's own healthcheck budget in docker-compose.yml,
# which is start_period 90s plus interval 30s x retries 5 = 240s. Giving up
# sooner means reporting a failed first boot while Jenkins is still doing the
# slow part of it - unpacking, installing plugins, running the init scripts -
# and it would look like a broken controller rather than a starting one.
# 84 x 5s = 420s, comfortably clear of that, with room for a slow disk.
attempt=0
while :; do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' fixmate-jenkins 2>/dev/null || echo missing)"
    if [ "$health" = "healthy" ]; then
        log "Controller is healthy"
        break
    fi

    attempt=$((attempt + 1))
    if [ "$attempt" -ge 84 ]; then
        warn "Jenkins did not become healthy within 7 minutes. Recent logs:"
        docker logs --tail 40 fixmate-jenkins >&2 || true
        die "Controller did not come up. Fix the above, then re-run."
    fi

    # A container that exited will never become healthy, so say so now instead
    # of waiting out the full timeout against something already dead.
    if [ "$(docker inspect --format '{{.State.Status}}' fixmate-jenkins 2>/dev/null)" = "exited" ]; then
        warn "The controller container exited during startup. Logs:"
        docker logs --tail 40 fixmate-jenkins >&2 || true
        die "The controller container exited during startup."
    fi

    # Say something every 30s so a long first boot does not look like a hang.
    if [ $((attempt % 6)) -eq 0 ]; then
        printf '    still %s after %ds (first boot unpacks Jenkins and installs plugins)\n' \
            "$health" "$((attempt * 5))"
    fi
    sleep 5
done

# The controller's own address, not the deploy target's. Easy to conflate and
# the resulting URL points at a machine with no Jenkins on it.
CONTROLLER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$CONTROLLER_IP" ] || CONTROLLER_IP="<this-host>"

cat <<EOF

$(printf '\033[1;32m==> The controller is up.\033[0m')

  URL            http://${CONTROLLER_IP}:${JENKINS_PORT}
  Deploy host    ${DEPLOY_USER_EFFECTIVE}@${DEPLOY_HOST_EFFECTIVE}
  Platform       ${PLATFORM_EFFECTIVE}
  Image          ${IMAGE_REPO_EFFECTIVE}
  Repository     ${REPO_URL_EFFECTIVE}

  Log in with the admin password Jenkins prints on first boot:

    docker logs fixmate-jenkins 2>&1 | grep -i "initial admin password"

  Then run the 'fixmate' job. It builds, pushes, deploys and smoke tests.

EOF
