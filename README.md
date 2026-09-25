# FixMate

A Laravel 13 application on PHP 8.4, packaged as a single Docker image and
deployed to a VPS by a Jenkins pipeline.

```
  git push
      │
      ▼
  Jenkins (container, Linux server)
      │  1. verify   pint
      │  2. test     phpunit
      │  3. build    docker build  →  ghcr.io/OWNER/fixmate/app:<sha>
      │  4. deploy   ssh → 92.5.105.170  →  pull, migrate, swap, health check
      │  5. smoke    curl the public URL
      ▼
  VPS 92.5.105.170
      app (nginx + PHP-FPM)  ·  queue worker  ·  scheduler  ·  MySQL 8.4  ·  Redis 7
```

One image serves all three application roles. Only the command differs, so the
web server, the queue worker and the scheduler always run identical code.

## Layout

| Path | What it is |
| --- | --- |
| `Dockerfile` | 4 stages: assets → composer → runtime → CI. `docker build .` defaults to the deployable image. |
| `docker/` | nginx, PHP-FPM, OPcache, supervisor and the container entrypoint. |
| `docker-compose.yml` | Local dev. Source is bind-mounted, so PHP edits are live. |
| `docker-compose.prod.yml` | Production. No source on disk, no bind mounts, image pulled from the registry. |
| `Jenkinsfile` | The pipeline. |
| `deploy/deploy.sh` | Runs **on the VPS**. Pull, migrate, swap, health check, roll back. |
| `deploy/rollback.sh` | Manual rollback from the VPS. |
| `deploy/env.example` | Template for the VPS `.env`. |
| `deploy/jenkins/` | The Jenkins controller's own image and compose file. |

## Before you start

Replace `OWNER` with your container registry namespace in two places:

- `Jenkinsfile` → `IMAGE_NAME = 'ghcr.io/OWNER/fixmate/app'`
- `deploy/env.example` → `APP_IMAGE=ghcr.io/OWNER/fixmate/app:latest`

## Local development

```sh
composer install
npm install && npm run build
cp .env.example .env && php artisan key:generate

docker compose up -d --build
docker compose exec app php artisan migrate
```

The app is on <http://localhost:8000>, MySQL on `127.0.0.1:3306` and Redis on
`127.0.0.1:6379`.

For CSS/JS hot reload, run the Vite dev server alongside it:

```sh
docker compose --profile hot up -d
```

Notes:

- The bind mount shadows the image's `vendor/`, so `composer install` and
  `npm run build` must be run on the host. The `assets` service does this
  inside the container for the Vite process only.
- Config is not cached in development, so `.env` and `config/` changes apply on
  the next request.

## One-time VPS setup

On `92.5.105.170`:

1. **Install Docker** with the Compose plugin:

   ```sh
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker "$USER"   # log out and back in
   ```

2. **Create the deploy user** and give it passwordless Docker access. The
   pipeline talks to Docker directly, so this user is effectively root on that
   box — use a dedicated user, not your personal one.

   ```sh
   sudo adduser --disabled-password --gecos '' deploy
   sudo usermod -aG docker deploy
   sudo mkdir -p /opt/fixmate && sudo chown deploy:deploy /opt/fixmate
   ```

3. **Create the environment file** from the template and fill it in. Generate
   the app key with:

   ```sh
   docker run --rm -u 0 ghcr.io/OWNER/fixmate/app:latest \
       php artisan key:generate --show
   ```

   ```sh
   scp deploy/env.example deploy@92.5.105.170:/opt/fixmate/.env
   ssh deploy@92.5.105.170 'chmod 600 /opt/fixmate/.env'
   ```

4. **Put a reverse proxy in front.** Port 80 is already in use on this host, so
   the app publishes `APP_PORT` (8080 by default) and your existing web server
   proxies to it. Terminate TLS there — this container speaks plain HTTP.
   Port 443 is currently closed, so there is no HTTPS listener yet.

The pipeline rsyncs `docker-compose.prod.yml` and `deploy/` into `/opt/fixmate`
on every run. `.env` is never overwritten.

## One-time Jenkins setup

On your Linux server, alongside the Docker daemon:

```sh
docker compose -f deploy/jenkins/docker-compose.yml up -d --build
```

Open `http://<server>:8080`. The setup wizard is skipped; plugins are baked
into the image and a buildx builder is created on first boot.

The Jenkins workspace is **not** shared with the Docker daemon — every stage
builds an image from the checkout and runs it, so there is no bind-mount path
confusion. That is also why the workspace needs no PHP, Composer or Node
installed on the host.

### Credentials to add

Under *Manage Jenkins → Credentials*, add:

| ID | Kind | Value |
| --- | --- | --- |
| `fixmate-registry` | Username with password | your registry user + a token with `write:packages` |
| `fixmate-ssh-key` | SSH private key | the key for `deploy@92.5.105.170` |
| `fixmate-known-hosts` | Secret text | see below |

```sh
ssh-keyscan -H 92.5.105.170 > known_hosts
```

Paste that into the secret-text credential. The pipeline uses
`StrictHostKeyChecking=yes` rather than `accept-new`, so a changed host key
fails the build instead of silently trusting a new machine.

## Running the pipeline

Create a **Pipeline** job pointing at this repository's `Jenkinsfile`, then:

- `TARGET` — `none` verifies and builds only, `staging` or `production` deploys.
- `DEPLOY_HOST` — defaults to `92.5.105.170`.
- `DEPLOY_USER` — `deploy`.
- `PLATFORM` — `linux/amd64` by default. Use `linux/arm64` if the VPS is
  Graviton or Apple silicon. **This must match the VPS**, or the image will
  fail to start there.
- `HEALTH_URL` — optional public URL (e.g. `https://your-domain/up`) checked
  from outside the VPS, so a container that is healthy on localhost but
  unreachable publicly still fails the build.

The pipeline refuses to deploy a non-`main` branch to `production` from a
non-`CHANGE_ID` build.

### What each stage does

- **Verify** — builds the CI target and runs `pint --test`.
- **Test** — runs PHPUnit against in-memory SQLite. No MySQL or Redis needed.
- **Build and push** — `docker buildx build --platform ... --push`, tagged with
  the short commit SHA.
- **Deploy** — rsyncs the compose file and scripts, then runs `deploy.sh`.
- **Smoke test** — curls `HEALTH_URL` with retries.

The deploy runs in the order pull → migrate → swap → health check, so the
previous release keeps serving traffic for as long as possible. If any step
fails, the previously recorded image is restarted automatically.

## Rolling back

`deploy.sh` rolls back by itself on a failed deploy. To undo a deploy that
looked healthy:

```sh
ssh deploy@92.5.105.170 'cd /opt/fixmate && ./deploy/rollback.sh'
```

> **Migrations are not reverted.** MySQL cannot roll back DDL, so a migration
> that fails midway can leave the schema partially changed. Write migrations
> using expand/contract — add the column, deploy, backfill, drop the old one in
> a later release — so every individual release is safe to roll back.

## Day-to-day commands

```sh
# Production host
cd /opt/fixmate
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml exec app php artisan queue:restart
docker compose -f docker-compose.prod.yml exec app php artisan about
```

## Things worth knowing

- **The image is immutable.** There is no source checkout on the VPS and no
  `composer install` at deploy time — dependencies are baked in. To change a
  dependency, commit `composer.lock` and let the pipeline rebuild.
- **`php artisan config:cache` runs at container start**, not at build time, so
  real secrets get baked in without ever entering an image layer.
- **MySQL and Redis publish no ports** in production. Only the app publishes
  one. Both use health checks, and the app container blocks on them at startup.
- **`opcache.validate_timestamps = 0`** is safe here precisely because the image
  is replaced rather than mutated.
- **Nginx and PHP-FPM are validated at build time** (`nginx -t && php-fpm -t`),
  so a bad config fails the build instead of crash-looping on the VPS.
