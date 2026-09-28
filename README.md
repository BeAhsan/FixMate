# FixMate

A Laravel 13 JSON API on PHP 8.4, packaged as a single Docker image and
deployed to a VPS by a Jenkins pipeline. The back end serves JSON, plus the
health endpoint the deploy script polls; the four front-end applications that
will consume it are not in this repository yet. The one piece of front-end code
that is here is `packages/api-client`, the typed client generated from these
routes.

```
  git push
      │
      ▼
  Jenkins (container, Linux server)
      │  1. verify   pint
      │  2. test     phpunit
      │  3. build    docker build  →  ghcr.io/beahsan/fixmate/app:<sha>
      │  4. deploy   ssh → 192.168.139.242  →  pull, migrate, swap, health check
      │  5. smoke    curl the public URL
      ▼
  VPS 192.168.139.242
      app (nginx + PHP-FPM)  ·  queue worker  ·  scheduler  ·  MySQL 8.4  ·  Redis 7
```

One image serves all three application roles. Only the command differs, so the
web server, the queue worker and the scheduler always run identical code.

## Layout

| Path | What it is |
| --- | --- |
| `Dockerfile` | 4 stages: `vendor` → `runtime` → `test` → `production`. `docker build .` builds the last one, which is the deployable image. |
| `docker/` | nginx, PHP-FPM, OPcache, supervisor and the container entrypoint. |
| `docker-compose.yml` | Local dev. Source is bind-mounted, so PHP edits are live. |
| `docker-compose.prod.yml` | Production. No source on disk, no bind mounts, images pulled from the registry. Runs the back end and the four front ends. |
| `Jenkinsfile` | The pipeline. |
| `deploy/deploy.sh` | Runs **on the VPS**. Pull all five images, migrate, swap, health-check each, roll back. |
| `deploy/rollback.sh` | Manual rollback of the whole set from the VPS. |
| `deploy/status.sh` | What is running, what is on record, and whether they agree. |
| `deploy/env.example` | Template for the VPS `.env`. |
| `deploy/jenkins/` | The Jenkins controller's own image and compose file. |
| `deploy/test-deploy.sh` | Tests for the three scripts above, run by both CI gates. |

## Before you start

The registry namespace is already set to `ghcr.io/beahsan/fixmate/app`, matching
the GitHub remote. If you rename anything, change it in all three places:

- `Jenkinsfile` → `IMAGE_NAME`
- `deploy/env.example` → `APP_IMAGE`
- `deploy/jenkins/secrets/config.example` → `IMAGE_REPO`

Changing one of the three is the failure to avoid: the pipeline pushes to one
place, the VPS pulls from another, and the deploy fails on a pull with a 403 that
names none of them.

You also need a **GitHub token with `write:packages`** scope, saved as the
`fixmate-registry` credential in Jenkins. Generate one at
*GitHub → Settings → Developer settings → Personal access tokens → Fine-grained
tokens*, granting `Packages: Read and write`.

## Local development

```sh
composer install
cp .env.example .env && php artisan key:generate

docker compose up -d --build
docker compose exec app php artisan migrate
```

The API is on <http://localhost:8000>, MySQL on `127.0.0.1:3306` and Redis on
`127.0.0.1:6379`. `GET /up` is the health check.

Notes:

- The bind mount shadows the image's `vendor/`, so `composer install` must be
  run on the host. The API image compiles no front end, so it has no
  `npm run build` step — the front-end applications build separately, each into
  its own image.
- Config is not cached in development, so `.env` and `config/` changes apply on
  the next request.

## The workspace

This repository is an npm-workspaces monorepo. The Laravel back end is the
payload; `apps/` and `packages/` are what the front ends are built from, and npm
is the package manager because the repository already had a lockfile and the
pipeline already installs with it.

| Path | What it is |
| --- | --- |
| `apps/` | The four deployed front ends: `user`, `worker`, `admin`, `super-admin`. See `apps/README.md`. |
| `apps/*/Dockerfile` | One per application. Each builds a static export and serves it with nginx. |
| `docker/front-end/` | The nginx config every front-end image shares. |
| `packages/` | Shared code the applications import: `api-client` (the typed client), `session` (sign-in and renewal) and `ui` (the design system). |
| `package.json` | The workspace root. The `workspaces` globs are `apps/*` and `packages/*`. |

`npm install` at the root installs every member's dependencies, hoisting what it
can into a single root `node_modules` and linking each member in by its
`@fixmate/*` name. An application imports `@fixmate/api-client`, never a
relative path across the workspace.

### One command builds everything

```sh
npm install
npm run build
```

From a clean checkout that is the whole sequence, and `npm run build` is the one
thing worth memorising. It does two things in order:

1. `php artisan api-client:generate`, because `packages/api-client/src/generated`
   is not committed and nothing in the workspace can compile without it. The
   failure without this step is a wall of `Cannot find module
   './generated/routes/…'`, which reads like a broken package rather than a
   missing prerequisite.
2. Each member's own `build`, in dependency order.

Note that the second step does **not** pass `--if-present`, unlike `typecheck`
and `test`. A member without a `build` script is a mistake, and `--if-present`
would skip it and exit 0 — a green build that built nothing. Without the flag
npm fails with `Missing script: "build"` and names the member.

`npm run typecheck` and `npm test` do keep `--if-present`, because a package with
no tests is legitimate and one with no `typecheck` is a member that has not
needed one yet.

`apps/` deliberately holds no application yet. The workspace was stood up first
so that the first application is added to a structure already known to install,
resolve and build. One image serves three back-end roles, so the API build has
no Node in it and is not going to grow one; each application is built and shipped
by its own pipeline.

## The typed API client

`packages/api-client` is the single place that knows how to talk to this back
end. Its route functions are generated from the routes declared here, so a
renamed route cannot reach a browser as a 404.

```sh
php artisan api-client:generate   # write packages/api-client/src/generated
php artisan api-client:check      # fail if it no longer matches the front ends
npm install && npm run typecheck && npm test
```

The generated directory is not committed; `api-client:check` regenerates it into
a temporary directory and compares that against `packages/api-client/contract.json`.
Both run in CI, ahead of the test suite. See `packages/api-client/README.md`.

## One-time VPS setup

`bootstrap-vps.sh` does the mechanical parts for you — Docker, `/opt/fixmate`,
and a `.env` with generated secrets. Two things it deliberately does not do,
because they are judgement calls:

1. **Create the `deploy` user.** The pipeline talks to Docker directly, so this
   user is effectively root on that box. Use a dedicated one, not your personal
   account.

   ```sh
   sudo adduser --disabled-password --gecos '' deploy
   sudo usermod -aG docker deploy
   ```

2. **Put a reverse proxy in front.** Port 80 is already in use on this host, so
   the app publishes `APP_PORT` (8080 by default) and your existing web server
   proxies to it. Terminate TLS there — this container speaks plain HTTP. Port
   443 is currently closed, so there is no HTTPS listener yet.

The pipeline rsyncs `docker-compose.prod.yml` and `deploy/` into `/opt/fixmate`
on every run. `.env` is never overwritten.

## First deploy

One command on the VPS does the whole one-time setup: installs Docker, drops
the config in `/opt/fixmate`, and writes a `.env` with a freshly generated app
key and database passwords.

```sh
scp -rp docker-compose.prod.yml deploy ahsanmanzoor@192.168.139.242:/tmp/
ssh -t ahsanmanzoor@192.168.139.242 \
  'cd /tmp && bash ./deploy/bootstrap-vps.sh --url http://192.168.139.242:8080'
```

Both `docker-compose.prod.yml` and `deploy/` are needed. The script installs
them side by side into `/opt/fixmate`, so copying `deploy/` alone leaves it with
no orchestration file to install. If the server has a checkout already, pass
`--repo <git-url>` instead and the script will clone instead of copying.

Two details in the first form are deliberate. The `-p` on `scp` preserves
permissions; without it the scripts land as `644` and running one as
`./deploy/foo.sh` fails with `Permission denied`. And the script is invoked as
`bash ./deploy/foo.sh` rather than `./deploy/foo.sh`, so it does not matter
whether the executable bit survived the copy at all.

The image must already be in the registry, because the app key is generated by
running it. If it is not there yet, push it first:

```sh
docker login ghcr.io                       # username + a token with write:packages
docker buildx build --platform linux/amd64 \
    --tag ghcr.io/beahsan/fixmate/app:manual \
    --tag ghcr.io/beahsan/fixmate/app:latest \
    --push .
```

Check `uname -m` on the VPS first: `x86_64` wants `linux/amd64`, `aarch64` wants
`linux/arm64`. Getting this wrong does not fail the build, it fails on the
target with an exec format error.

**If the package is private**, bootstrap needs a pull token before it can
generate the app key, because the key is produced by running the image. On a
first run there is no `.env` to put the token in yet, so expect bootstrap to
stop with:

```
XXX APP_KEY is empty in /opt/fixmate/.env, and the application cannot boot
    without it. Refusing to report the server as ready.
```

That is the script being honest rather than broken. It has written `.env` and
everything else, and has nothing left to do but wait for a token. Add one - a
separate, weaker credential than the push token, `read:packages` only, and it
never leaves the server:

```sh
ssh -t ahsanmanzoor@192.168.139.242 \
  "printf 'REGISTRY_USER=%s\nREGISTRY_TOKEN=%s\n' 'BeAhsan' 'paste-your-token-here' \
   | sudo tee -a /opt/fixmate/.env >/dev/null"
```

Then run bootstrap a second time. It logs in, pulls, fills in the missing
`APP_KEY`, and reports the server ready. The database password generated the
first time is left alone, so this repair is safe to repeat.

Two details in that command are deliberate. The `printf` runs on the remote side
rather than being a local heredoc, because `ssh -t` allocates a pty and a heredoc
piped into one can leave `\r` at the end of every line it writes. And
`>/dev/null` keeps the token off your terminal.

Leave those two lines out for a public image and the deploy skips logging in.

Then deploy, and confirm:

```sh
ssh -t ahsanmanzoor@192.168.139.242 'cd /opt/fixmate && bash ./deploy/deploy.sh ghcr.io/beahsan/fixmate/app:manual'
curl -i http://192.168.139.242:8080/up
```

The script is safe to re-run: it leaves an existing `.env` alone, so a partial
run never costs you the generated secrets.

## One-time Jenkins setup

The controller runs on its own machine (`192.168.139.26`) and reaches the deploy
host over SSH, so nothing has to be port-forwarded.

One script does the whole preparation - installing Docker, fetching a checkout
and creating the secrets directory - then stops and tells you what is still
missing, because credentials cannot be invented:

```sh
bash deploy/jenkins/setup-controller.sh
```

**Fill in the secrets** it points at. The first run has written
`deploy/jenkins/secrets/config` from the template; check at least `DEPLOY_HOST`,
`DEPLOY_USER`, `PLATFORM` and `REPO_URL`. Then create four files in the same
directory, each named exactly:

| File | How to produce it |
| --- | --- |
| `registry-user` | your GitHub username |
| `registry-token` | a token with `write:packages` |
| `ssh-key` | the private key Jenkins uses to reach the deploy host |
| `known-hosts` | `ssh-keyscan -H 192.168.139.242 > known-hosts` |

The key pair is generated on the controller and the public half added to
`~/.ssh/authorized_keys` on the deploy host:

```sh
ssh-keygen -t ed25519 -N '' -f ~/.ssh/fixmate_deploy
ssh-keyscan -H 192.168.139.242 > deploy/jenkins/secrets/known-hosts
```

`known-hosts` is not ceremony. The pipeline connects with
`StrictHostKeyChecking=yes`, so this file is what pins the identity of the host
it deploys to; without it the first connection is whatever answers on that
address.

All four are gitignored. The controller reads them on startup and creates the
credentials and the pipeline job itself, so there is nothing to click through.
Change one and restart the container to roll it.

**Start the controller** by running the same script again. It is idempotent, so
this second run skips the preparation, brings the container up and waits for it
to report healthy:

```sh
bash deploy/jenkins/setup-controller.sh
```

**Open it** at <http://192.168.139.26:8080>, log in with the initial admin
password the script tells you how to read, and run the `fixmate` job. It is
already there, already pointed at the right branch. The setup wizard is skipped,
plugins are baked into the image, and a buildx builder is created on first boot.

If the secrets directory is missing or incomplete the controller still boots
and logs what it skipped - you can then wire the job up by hand under
*Manage Jenkins -> Credentials*.

The Jenkins workspace is **not** shared with the Docker daemon — every stage
builds an image from the checkout and runs it, so there is no bind-mount path
confusion. That is also why the workspace needs no PHP, Composer or Node
installed on the host.

## Running the pipeline

Push to `main` and the `fixmate` job does the rest. You can also run it by hand
with parameters:

- `TARGET` — `none` verifies and builds only, `staging` or `production` deploys.
- `DEPLOY_HOST` — defaults to `192.168.139.242`.
- `DEPLOY_USER` — defaults to `ahsanmanzoor`.
- `DEPLOY_DIR` — defaults to `/opt/fixmate`. The directory on the VPS holding
  `docker-compose.prod.yml` and `.env`.
- `PLATFORM` — defaults to `linux/arm64`, which is right for an Apple silicon or
  Graviton host. Use `linux/amd64` for an Intel one. **This must match the VPS**:
  getting it wrong does not fail the build, it fails on the target with an exec
  format error.
- `API_URL` — the public address of the back end, for example
  `https://api.example.com`. It is **baked into each front-end export at build
  time**, because a front end reads nothing at run time, so it cannot be supplied
  later. Required unless `TARGET` is `none`. Its origin has to be one of the four
  in `config/applications.php`, or the browser refuses every request before the API
  is even asked.
- `HEALTH_URL` — optional public URL (e.g. `https://your-domain/up`) checked
  from outside the VPS, so a container that is healthy on localhost but
  unreachable publicly still fails the build.

These are the `parameters` block's own defaults, and a test asserts this list
still matches it — see `DeploymentMatchesThePipelineTest`.

## Rolling back

`deploy.sh` rolls back by itself on a failed deploy. To undo a deploy that
looked healthy:

```sh
ssh -t ahsanmanzoor@192.168.139.242 'cd /opt/fixmate && bash ./deploy/rollback.sh'
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

### Creating the first account

A fresh install has no accounts, and there is no registration, no invitation and
no admin panel. The first one is created from the command line:

```sh
cd /opt/fixmate
docker compose -f docker-compose.prod.yml exec app \
    php artisan fixmate:create-account super_admins \
    --name="Ada Lovelace" --email=ada@example.com
```

`type` is one of `users`, `workers`, `admins`, `super_admins`. A password is
generated and **printed once** — it is not stored in readable form and not written
to any log, so if you lose it, run the command again with a different address.

Two things worth knowing before you use it:

- **Hand the password over out of band.** It is on your terminal, in your scrollback
  and in whatever you copy it into.
- **The account is flagged `must_change_password`**, so every session it gets is
  refused everywhere until the password is replaced. Sign-in reports the flag, and
  `EnsurePasswordChanged` is the control behind it.

`--password` exists and is a bad idea: an argument is visible in shell history and
in the process listing. The command warns you when you use it.

The command only checks the store it is provisioning into. If it says an address is
taken, that is true of *that* account type and says nothing about the other three.

### Replacing a provisioned password

An account created above signs in, and is then refused by every route except
`POST /api/v1/identity/{type}/password/change`. That call takes the current
password and a new one, and withdraws every other session the account had — a
session opened with the old password keeps working however new the stored hash is.

**No front end calls that route yet.** The four dashboards are shell-only, so
nothing reads the sign-in flag and routes to a change screen. Until that exists, a
provisioned account reaches its new password through the ordinary "forgot password"
flow, which is outside the guard and therefore still works. That gap is the
remaining piece of ticket 26, and it is a front-end change rather than a back-end
one.

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
