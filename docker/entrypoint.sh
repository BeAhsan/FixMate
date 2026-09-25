#!/bin/sh
#
# Container entrypoint for the FixMate application image.
#
# With no arguments (or "supervisord") this starts nginx + PHP-FPM via supervisor.
# Any other command is executed verbatim, which is how the queue worker,
# the scheduler and one-off `artisan` calls run from the same image.

set -e

APP_DIR="${APP_DIR:-/var/www/html}"
cd "$APP_DIR"

# The image ships without runtime state, so recreate the writable dirs.
# With a read-only root filesystem, bind-mount these instead (see docker-compose.prod.yml).
mkdir -p \
    storage/framework/cache/data \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs \
    bootstrap/cache

chown -R www-data:www-data storage bootstrap/cache

# Block until MySQL and Redis accept connections. Enabled by APP_WAIT_FOR_SERVICES
# so the app, queue and migrate containers all wait out a cold `compose up`.
if [ "${APP_WAIT_FOR_SERVICES:-0}" = "1" ]; then
    wait_for_tcp() {
        host="$1"; port="$2"; label="$3"; timeout="${4:-90}"
        elapsed=0
        echo "Waiting for ${label} at ${host}:${port} ..."
        while [ "$elapsed" -lt "$timeout" ]; do
            if php -r '$f=@fsockopen($argv[1], (int) $argv[2], $e, $s, 1); exit($f ? 0 : 1);' "$host" "$port"; then
                echo "${label} is up."
                return 0
            fi
            elapsed=$((elapsed + 1))
            sleep 1
        done
        echo "Timed out after ${timeout}s waiting for ${label} at ${host}:${port}" >&2
        return 1
    }

    wait_for_tcp "${DB_HOST:-mysql}" "${DB_PORT:-3306}" "MySQL" "${APP_DB_WAIT_TIMEOUT:-90}"
    wait_for_tcp "${REDIS_HOST:-redis}" "${REDIS_PORT:-6379}" "Redis" "${APP_REDIS_WAIT_TIMEOUT:-60}"
fi

if [ "$#" -eq 0 ] || [ "$1" = "supervisord" ]; then
    # Bake the real environment (secrets arrive as container env / mounted .env)
    # into a config cache now that the real values are present. Skipped in local
    # development so edits to .env and config/ take effect without a rebuild.
    if [ "${APP_ENV:-production}" = "production" ]; then
        php artisan config:cache --quiet || \
            echo "Warning: config:cache failed; continuing with uncached config." >&2
    fi

    exec /usr/bin/supervisord -c /etc/supervisord.conf
fi

exec "$@"
