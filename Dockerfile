# syntax=docker/dockerfile:1.7
#
# FixMate application image.
#
# One image serves every runtime role: the web server (nginx + PHP-FPM), the
# queue worker and the scheduler. Only the command differs, so all three are
# guaranteed to run identical code.
#
#   docker build -t fixmate/app:<sha> .
#
# Dependencies are installed in throwaway stages and only the compiled output
# is copied forward, so no build toolchain ends up in the runtime layer.

ARG PHP_VERSION=8.4
ARG NODE_VERSION=22-alpine
ARG COMPOSER_VERSION=2.9

# ---------------------------------------------------------------------------
# Stage 1 - Frontend assets
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS assets

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY vite.config.js .npmrc ./
COPY resources/ ./resources/
COPY public/ ./public/

# Vite needs APP_NAME for the compiled bundle.
ARG APP_NAME="FixMate"
ENV VITE_APP_NAME="${APP_NAME}"

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 - PHP dependencies
# ---------------------------------------------------------------------------
FROM composer:${COMPOSER_VERSION} AS vendor

WORKDIR /app
ENV COMPOSER_ALLOW_SUPERUSER=1

# Dependencies first: this layer is cached until composer.json/lock change.
COPY composer.json composer.lock ./
RUN composer install \
        --no-dev \
        --no-scripts \
        --no-autoloader \
        --prefer-dist \
        --no-interaction \
        --ignore-platform-req='ext-*'

COPY . .

# Build-time placeholders only. The runtime container bakes its real config
# from the environment in docker/entrypoint.sh. Nothing here is a secret.
ENV APP_ENV=production \
    APP_DEBUG=false \
    APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=

RUN composer dump-autoload --optimize --classmap-authoritative --no-dev

# ---------------------------------------------------------------------------
# Stage 3 - Runtime
# ---------------------------------------------------------------------------
FROM php:${PHP_VERSION}-fpm-alpine AS runtime

LABEL org.opencontainers.image.title="FixMate" \
      org.opencontainers.image.description="Laravel application served by nginx + PHP-FPM" \
      org.opencontainers.image.source="https://github.com/OWNER/FixMate"

ENV APP_DIR=/var/www/html \
    COMPOSER_ALLOW_SUPERUSER=1

# nginx + supervisor run the two server processes; curl backs the healthcheck.
RUN apk add --no-cache nginx supervisor curl tzdata

# pdo_mysql/bcmath/intl/gd/zip are Laravel plus common driver needs.
# redis backs REDIS_CLIENT=phpredis; without it every cached session, cache
# hit and queue connection dies at runtime. pcntl is required by the queue
# worker and the scheduler. sodium, mbstring, curl, openssl and tokenizer ship
# with the base image already.
COPY --from=mlocati/php-extension-installer:2 /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions bcmath exif gd intl opcache pcntl pdo_mysql redis zip

# Replace the image defaults (the stock www pool would collide with ours).
COPY docker/php/php.ini /usr/local/etc/php/conf.d/zz-app.ini
COPY docker/php/www.conf /usr/local/etc/php-fpm.d/www.conf
COPY docker/nginx/default.conf /etc/nginx/http.d/default.conf
COPY docker/supervisor/supervisord.conf /etc/supervisord.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

# Fail the build on a bad server config instead of crash-looping on the VPS.
RUN nginx -t && php-fpm -t

WORKDIR ${APP_DIR}

COPY --chown=www-data:www-data --from=vendor  /app              ${APP_DIR}
COPY --chown=www-data:www-data --from=assets  /app/public/build ${APP_DIR}/public/build

# A pre-built config cache from the vendor stage would freeze build-time values.
RUN rm -f bootstrap/cache/config.php bootstrap/cache/routes-*.php \
    && mkdir -p storage/framework/cache/data storage/framework/sessions \
                storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

# Serve HTTP and stay unprivileged for PHP-FPM workers; port 80 is container-internal
# behind the published port.
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1/up || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint"]
CMD ["supervisord"]

# ---------------------------------------------------------------------------
# Stage 4 - CI
# ---------------------------------------------------------------------------
# Built only via `docker build --target test`, so the release image stays lean
# while CI still gets PHPUnit, Pint and the rest of the dev dependencies.
# The entrypoint is bypassed: this target runs one command and exits.
FROM runtime AS test

USER root

# The composer binary is already present in the vendor stage, so reuse it
# rather than pulling the image a second time.
COPY --from=vendor /usr/bin/composer /usr/local/bin/composer

# Placeholders only, so package discovery works without a real .env.
ENV APP_ENV=testing \
    APP_DEBUG=false \
    APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=

RUN composer install --prefer-dist --no-interaction

ENTRYPOINT []
CMD ["php", "artisan", "test"]

# ---------------------------------------------------------------------------
# Stage 5 - Default target
# ---------------------------------------------------------------------------
# A bare `docker build .` builds the LAST stage, which would otherwise be the
# throwaway CI target above. Aliasing runtime here keeps `docker build -t . .`
# producing the deployable image. `--target test` and `--target runtime` both
# still work and mean the same thing.
FROM runtime AS production
