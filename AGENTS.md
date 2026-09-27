# FixMate — agent notes

Everything below is verified against this repo. Where the README disagrees with
the code, the code wins and the README is named as the stale one.

## What this repo is

- A Laravel 13 app (`laravel/framework` 13.33) that is a **JSON API and nothing
  else**. There is no Blade, no Vite, and no route that renders a page:
  `routes/api.php` is the only route file and `resources/` does not exist. npm
  exists as a workspaces root and there is one front-end *application*
  (`apps/user`, a Next.js static export) — do not assume a feature area, model
  or endpoint exists beyond the one end-user sign-in route.
- **The actual work in this repo is infrastructure.** Dockerfile, `docker/`,
  `docker-compose*.yml`, `Jenkinsfile` and `deploy/` are the substance; the app
  is the payload. Read those before forming an opinion about the project.
- **One image serves three roles** — web (nginx + PHP-FPM), queue worker and
  scheduler. Only the command differs, so the tag that was tested is the tag
  that ships. nginx is still the HTTP server even though it no longer serves a
  page: it routes every path to `public/index.php` and hands it to PHP-FPM.
- **Production is Docker on a VPS, deployed by Jenkins.** Not Laravel Cloud,
  even though `boost.json` sets `"cloud": true` and a `deploying-to-cloud` skill
  is installed. Ignore both; nothing here touches `cloud.laravel.com`.

## Traps

### `src/`, `stage/`, `dst/`, `out/` are test fixtures, not source

These four directories are **rsync test fixtures**, committed in `a0d212c` to
prove the `--delete` staging fix in the `Jenkinsfile`. Their bodies are
placeholders: `src/deploy/deploy.sh` is the single line `new deploy`,
`dst/deploy/stale.sh` is `STALE - dropped from the repo`, and `dst/.env` is `KEEP`
(present but untracked, because `.env` is gitignored — that fixture exists to
show `--exclude '.env'` is what saves the VPS copy).

- Never edit them, never "fix" them, and never treat them as a second copy of the
  deploy scripts. The real ones are `deploy/deploy.sh` and
  `docker-compose.prod.yml`. An edit made to a fixture ships inside the image and
  changes nothing that runs.
- They are absent from `.dockerignore`, so they do travel in the build context and
  into the image. Harmless, but expect to see them there.
- **`out/` will collide with Next.js's static export, and the fixture wins.** The
  frontend-foundation notes assume `output: 'export'` writes to `out/`; it does,
  but *per application* — `apps/user/out`, not the repository root. The root
  `out/` is this fixture, and it stays. Do not add an `out` entry to
  `.gitignore`: that would silently untrack the fixture. If a build ever needs
  the root directory, rename the fixture in its own commit rather than deleting
  it, and update this section.
- **`.dockerignore` scopes its `out` exclusion to `apps/*/out` and
  `packages/*/out` for the same reason.** A bare `out` there would match the
  root fixture. The fixture travelling into the image is harmless and
  expected; a bare `out` in an ignore file is how it starts quietly not
  travelling, which is a different kind of wrong.

### A bare `node_modules` in `.dockerignore` only matches the root

Docker matches an ignore pattern containing no slash against the **root
directory only**, unlike `.gitignore`, where a slashless pattern matches at any
depth. The two files in this repository look similar and do not behave the same
way, and the `.dockerignore` was wrong about this: a bare `node_modules`
excluded the root install and let every nested one through.

That mattered little with one package and no applications. It does not matter
little with four Next.js applications, each of which can end up with its own
`node_modules` — npm nests a workspace's own `node_modules` inside the package
whenever hoisting conflicts, which the `.gitignore` comment on the same pattern
already says out loud. `.dockerignore` now uses `**/node_modules`. Verified with
a real `docker build` and a `find` in the resulting layer: nested
`apps/user/node_modules` was present before and is gone after.

The general form of the trap: **the Dockerfile does `COPY . .`, so anything
`.dockerignore` does not list is swept into the API image on every build, and
the build still succeeds.** Front-end build output is excluded ahead of the
applications that produce it — `**/.next`, `apps/*/out`, `apps/*/dist`,
`packages/*/dist`, `**/coverage`, `**/.turbo` — because adding a line to a list
costs nothing and un-learning one costs an image that is hundreds of megabytes
larger than it should be.

### `/up` is the last HTML response, and it does not come from this app's code

`bootstrap/app.php` registers it with `withRouting(health: '/up')`, and the
route the framework builds for that is unusual in two ways:

- It is registered with **no middleware group at all** — not `web`, not `api`.
  So deleting `routes/web.php` and the `web:` argument cannot break it, and
  forcing JSON in the exception handler cannot either.
- The closure behind it renders
  `vendor/laravel/framework/src/Illuminate/Foundation/resources/health-up.blade.php`
  — a **Blade view shipped inside the framework package** — unless the request
  sends `Accept: application/json`, in which case it returns
  `{"status":"up"}`. `curl` sends no `Accept`, so a plain health check gets
  that HTML page with a 200.

That is why "the back end serves no HTML" has exactly one exception, and why
`tests/Feature/ApiSurfaceTest.php` asserts only the status of `/up` and never
its content type. `deploy/deploy.sh`, the container `HEALTHCHECK` and the
pipeline's smoke check all poll it, so it must keep answering 200 unchanged.

### Console output is JSON, not test output

`laravel/pao` detects an agent environment and replaces console output with a
single JSON line. This is expected, not a failure:

```
$ php artisan test --compact
{"tool":"phpunit","result":"passed","tests":2,"passed":2,"assertions":2,"duration_ms":124}

$ vendor/bin/pint --test
{"tool":"pint","result":"passed"}
```

`PAO_DISABLE=1` restores normal human output. `PAO_FORCE=1` forces JSON when no
agent is detected.

### The README's pipeline defaults are stale

`README.md` says `PLATFORM` defaults to `linux/amd64` and `DEPLOY_USER` to
`deploy`. Both `Jenkinsfile` and `deploy/jenkins/secrets/config.example` say
**`linux/arm64`** and **`ahsanmanzoor`** — both machines are OrbStack VMs on Apple
Silicon. The Jenkinsfile's `parameters {}` block supplies the job's defaults and
wins on first run; `deploy/jenkins/setup-controller.sh` cross-checks the two and
warns when they disagree.

### Boost regenerates only its own block

`php artisan boost:install` and `boost:update` rewrite the
`<laravel-boost-guidelines>…</laravel-boost-guidelines>` block at the bottom of
this file and preserve everything around it
(`vendor/laravel/boost/src/Install/GuidelineWriter.php`). That is why the notes
above live outside the block — keep it that way.

`boost.json` now has `"skills": []`. Boost's OpenCode agent hardcodes
`.agents/skills` as its install path, so leaving skills enabled there would write
a duplicate set back under colliding names. This repo owns `.opencode/skills/`.

## Commands

Gate order matches the Jenkins `Verify` → `Test` → `Front end` stages — **Pint
first**, then tests, then the front ends:

```sh
vendor/bin/pint --dirty --format agent   # format what you touched
vendor/bin/pint --test                   # what CI actually runs
php artisan test --compact               # whole suite
php artisan test --filter=methodName     # one test
```

The generated-client drift check is its own command, and it runs in CI ahead of
the suite (Jenkins `Test` stage and `.github/workflows/laravel.yml`):

```sh
php artisan api-client:generate          # write packages/api-client/src/generated
php artisan api-client:check             # regenerate into a temp dir, compare to contract.json
php artisan api-docs:check               # compare packages/api-client/openapi.json to the routes
```

`api-client:check` is the check that catches a renamed route. Changing a route
means changing `routes/api.php`, `packages/api-client/contract.json` and the
`packages/api-client/src/operations.ts` together, or the check fails.
`api-docs:check` is a *separate* command for `openapi.json`, and the separation is
load-bearing: `contract.json` has no field for a security requirement, so nothing
in `api-client:check` would notice a document describing a protected route as
open. `api-docs:check` reads the route's own gathered middleware, so it does not
trust the document's sentence about it.

The TypeScript side:

```sh
npm install                             # once, from the root
npm run build                           # generate the client, then build every member
npm run typecheck
npm test
```

`npm run build` is the single documented build for a developer on a host, and it
is the only one worth memorising. It runs `php artisan api-client:generate`
first, because `src/generated/` is not committed and nothing compiles without it,
then every member's `build`.

**It does not pass `--if-present`, unlike `typecheck` and `test`.** A member
without a `build` script is a mistake, and `--if-present` would skip it and exit
0 — a green build that built nothing. Verified against npm 11: with the flag, a
workspace missing the script exits 0; without it, npm fails with `Missing
script: "build"` and names the member. Do not "tidy" the flag away.

`typecheck` and `test` keep `--if-present` deliberately: a package with no tests
is legitimate.

**CI does not use `npm run build`.** Both gates run
`php artisan api-client:generate` as its own step and then
`npm run build --workspaces`, because the root script's first line needs PHP and
the build needs Node, and the Jenkins stage runs them in separate containers —
`npm run build` there exits 127 with `php: not found`. The root command stays
correct for a host, where both are installed.

Both `npm run typecheck` and `npm run build` need
`php artisan api-client:generate` to have happened, because `src/generated/` is
not committed and the TypeScript imports it. `build` does it for you;
`typecheck` does not.

CI runs `pint --test`, so an unformatted file is caught by CI rather than by you.

Reproduce the CI stages in one shot, with no MySQL or Redis needed:

```sh
docker build --target test -t fixmate/app:ci . && docker run --rm fixmate/app:ci
```

That target's `CMD` is `php artisan test`, so `docker run` with no argument runs
the suite. The front-end stage is two containers, and the workspace has to be
bind-mounted into both:

```sh
docker run --rm -v "$PWD":/w -w /w fixmate/app:ci php artisan api-client:generate
docker run --rm -v "$PWD":/w -w /w -v fixmate-npm-cache:/root/.npm \
    -e NEXT_PUBLIC_API_URL node:22-alpine \
    sh -c 'npm ci && npm run typecheck && npm test && npm run build --workspaces'
rm -rf packages/api-client/src/generated
```

**Running that on a Mac replaces your `node_modules` with Linux binaries.** The
`node` container's `npm ci` writes musl builds over the host's darwin ones, and
the next host-side `npm test` fails with `Cannot find native binding` from
`rolldown`. Recover with `rm -rf node_modules && npm ci`. It is harmless on
Jenkins, where the workspace is only ever used from inside Linux containers, and
it is the price of the bind mount the stage needs — a socket-only controller
cannot see the workspace at all.

**Tests need no services.** `phpunit.xml` pins `DB_CONNECTION=sqlite` and
`DB_DATABASE=:memory:`, so the suite never touches a real database. The local
`database/database.sqlite` — gitignored via `database/.gitignore` (`*.sqlite*`) —
is only what a host-side `php artisan serve` uses, because `.env` selects sqlite.

### Two CI systems, one gate

`.github/workflows/laravel.yml` and the Jenkins `Verify`/`Test`/`Front end` stages
run the same checks — Pint, the suite, both drift checks, and the four front
ends' type-check, test and build — on the same PHP version. It is a pull-request
gate and nothing more: it does not build or push the image, because Jenkins pushes
straight to `ghcr.io` from the controller. If you add a check, add it in both
places or neither.

Three things about the front-end half that are easy to get wrong:

- **The pull-request workflow has a separate `front-end` job**, not more steps in
  the PHP one, so a front-end failure is reported as a front-end failure. It needs
  `setup-php` as well as `setup-node`, which looks redundant and is not: the typed
  client is generated by PHP and never committed, so nothing can typecheck without
  it. It needs no `key:generate` — generation does not read `APP_KEY`.
- **Jenkins runs the front ends in containers, with the workspace bind-mounted.**
  The other stages are socket-only, but a `node` container cannot see the
  workspace without a mount, and the workspace is where the generated client has
  to land. The `node:22-alpine` container therefore mounts `$PWD` at `/w`, and the
  stage removes `packages/api-client/src/generated` afterwards so the deploy
  stages do not inherit build output.
- **The front-end duplication rule is caught by the *PHP* job.**
  `FrontEndApplicationsTest` asserts that no application contains a copy of the
  sign-in flow or the shell, and it lives in `php artisan test` — so the two jobs
  are not independent, and a front-end architectural regression surfaces as a
  failing PHP job. That is where it belongs: the rule is repository-wide, and a
  front-end test could only ever see its own application.

Both gates were demonstrated failing, not just passing: a TypeScript error
(`npm run typecheck`), a failing front-end test (`npm test`), a route that cannot
be statically exported (the per-application test, then `npm run build`), a copied
sign-in flow (`php artisan test`), and a route renamed without the contract
(`api-client:check`, then a compile error naming the missing export).

### Dockerfile stages

`vendor` → `runtime` → `test` → `production`. A bare `docker build .` builds
the **last** stage, which is aliased `production` and is the same image as
`runtime` — that alias exists so the plain build produces the deployable image
rather than the throwaway CI target. `--target runtime` and `--target test` both
work. There is no `assets` stage and no `ARG NODE_VERSION`: the back end has no
front end to compile.

## Local development

Run `composer install` **on the host** before `docker compose up -d --build`.
The dev bind mount (`.:/var/www/html`) shadows the image's `vendor/`, so
anything installed inside the container is invisible to the app.

```sh
composer install
cp .env.example .env && php artisan key:generate
docker compose up -d --build
docker compose exec app php artisan migrate
```

Config is **not** cached in development, so `.env` and `config/` edits apply on
the next request. In production `php artisan config:cache` runs in
`docker/entrypoint.sh` at container start — never at build time, so real secrets
never enter an image layer.

## Deploy mechanics worth not breaking

- **Jenkins rsyncs only `docker-compose.prod.yml` and `deploy/`** into
  `/opt/fixmate`. It stages both into one temp directory and syncs *that*, and the
  staging form is load-bearing: `rsync --delete` applies within each source
  argument's own tree, so passing two sources prunes inside `deploy/` and leaves
  stale top-level files on the VPS forever.
- **`cp -R deploy "$STAGE/"`, never `deploy/`.** A trailing slash means "this
  directory's contents", which scatters the scripts at the top of the deploy dir
  and then `--delete` removes the `deploy/` directory that was holding them — a
  sync that transfers every byte and leaves no `./deploy/deploy.sh` to run.
- **`--exclude '.env'` is what keeps the VPS `.env` alive.** Do not add
  `--delete-excluded`; it would delete the generated `APP_KEY` and DB passwords.
- **`deploy/deploy.sh` runs on the VPS**, in this order: pull → migrate with the
  *new* image while the *old* containers still serve → swap → poll `/up` → run
  `migrate:status` as a real database check. It rolls back by itself on any
  failure, records `.current-release`, and appends `.release-history`.
  `deploy/rollback.sh` prompts before it runs.
- **Migrations are never reverted** — MySQL cannot roll back DDL. Write them
  expand/contract (add column → deploy → backfill → drop later) so every
  individual release is safe to roll back.
- **The image is immutable.** No source checkout on the VPS and no
  `composer install` at deploy time. To change a dependency, commit
  `composer.lock` and let the pipeline rebuild.
- **`PLATFORM` must match the target CPU** or the image exec-format-fails on the
  VPS — and the build still succeeds, so nothing catches it until deploy.
- **The registry name is in three places**: `Jenkinsfile` → `IMAGE_NAME`,
  `deploy/env.example` → `APP_IMAGE`, `deploy/jenkins/secrets/config.example` →
  `IMAGE_REPO`. Change all three.
- **`deploy/jenkins/secrets/*` is gitignored** except `config.example`. The
  controller's `init.groovy.d` reads those files on every start, so changing a
  secret means restarting the container.
- **Production publishes only the app port** (`APP_PORT`, 8080 by default). Port
  80 on the host is already taken, so the container speaks plain HTTP and TLS
  belongs on a reverse proxy in front. There is no HTTPS listener yet.
- **Jenkins `sh` blocks are `/bin/sh` (dash), not bash.** `${VAR##*/}` on an
  unset variable under `set -u` is a hard "parameter not set" and exit 2, not an
  empty string. That is why the Deploy stage's defaults are written
  `"${GIT_BRANCH:-}"`.
- **Jenkins Declarative traps already fixed here** — each has an explanatory
  comment in the `Jenkinsfile`, so read it before "simplifying":
  `def scmVars = checkout scm` must sit inside a `script {}` block; the git
  plugin's `GIT_COMMIT`/`GIT_BRANCH` do not reach `env` inside the stage that
  created them, so use the returned map; `node('built-in')` requires a label; and
  a Declarative `environment {}` block cannot reference a variable defined
  alongside it.

## The API surface

- **`routes/api.php` is the only route file.** `bootstrap/app.php` mounts it
  with the `api` middleware group under Laravel's default `api` prefix — still
  not versioned. The spec wants a versioned prefix, but that decision belongs
  to whichever ticket adds the first real route group, not to this one.
- **All four applications exist and each is twenty lines of configuration.**
  `apps/<name>/lib/application.ts` is the application: an `application` key, an
  address, a navigation and some copy. Everything else is imported. This is
  enforced by `tests/Feature/FrontEndApplicationsTest.php`, which fails if any
  application grows a `<form>`, a `fetch`, a router call, its own `<header>`, or a
  reference to another account type's operations.
- **The application key, not the account type, is what an application declares.**
  `OPERATIONS_BY_APPLICATION` in `@fixmate/session` turns `application: 'user'`
  into four operations bound to the `users` store. An application has no way to
  name another application's door, so the only thing that could stop it is the
  back end's `account.can` — and that is a control, not a convention.
- **Two Next.js constraints shape the file layout, and both fail confusingly.**
  `createApplication()` is called at module scope in a `'use client'` module, and
  Next refuses to *call* a client function during a server render ("Attempted to
  call createApplication() from the server"). So the dashboard and the sign-in
  page are client components, and the root layout — which must stay a server
  component because it exports `metadata` — renders `app/providers.tsx`, a thin
  client boundary. The server graph imports a *component*, never the module that
  does the calling.
- **A duplication rule lives in exactly one place.** It was briefly in the
  per-application vitest file as well, and it failed there for a good reason: the
  assertion matched the *docblock* of the file it was checking, because that
  docblock names the constructs the rule forbids while explaining it contains
  none. `FrontEndApplicationsTest` is authoritative; it is repository-wide and
  runs in both CI systems. A fingerprint test must strip comments.
- **`apps/<name>/test/static-export.test.ts` is byte-identical in all four** and
  is on the allowed-identical list with a reason. So are `app/providers.tsx` and
  `app/sign-in/page.tsx`, which are pure delegation and contain no logic. The
  test also fails if an entry on that list *stops* being identical — a list that
  quietly excuses whatever is present stops meaning anything.
- **Verify a mutation landed before concluding a guard is broken.** A regression
  check here "passed" because the edit had not applied, and the natural next step
  was to start rewriting a test that was working. `grep -c` the mutation first.
- **The four front ends are verified together, not one at a time.** Four images
  built, four containers healthy, each serving its own `data-export-marker`. A
  4×4 sign-in matrix returns 200 only on the diagonal with every request carrying
  its own door's `Origin` — which proves both the store isolation and that the
  allowed-origins list names all four. And one shared shell renders three
  different navigations for three ability sets: a super administrator sees
  everything, an administrator loses the `accounts:read` section, a customer has
  none of it.
- **`apps/user` builds to a static export, and its image has no Node in it.**
  `next.config.ts` sets `output: 'export'`, so `next build` writes `out/` and
  `apps/user/Dockerfile` copies that into an nginx image. The build context is
  the **repository root** (`docker build -f apps/user/Dockerfile .`), not
  `apps/user`, because the workspace hoists `node_modules` to the root and
  `npm ci` needs the lockfile naming every member. Inside that image the build
  runs `npm run build --workspace=@fixmate/user-app` and **not** the root
  `npm run build`, because the root script starts with
  `php artisan api-client:generate` and there is deliberately no PHP in a
  front-end image. `packages/api-client/src` is copied into the build stage;
  the client has no build step of its own because its `main` and `types` point at
  `./src/index.ts`, so Next compiles it from source.
- **The four application addresses live in `config/applications.php`, and
  `config/cors.php` derives its allowed origins from it.** Computing the list
  rather than writing it out twice is what stops a fifth application being added
  and forgotten; `CrossOriginRequestsTest` asserts the two agree and that there
  are four. Origins, never patterns and never `*` — a wildcard would let any
  site on the internet call this API with a token. The same host on a different
  port is a different origin, and there is a test for that too.
- **`packages/*/src/generated` is NOT in `.dockerignore`, and that is
  deliberate.** It used to be, on the reasoning that the API image regenerates
  it — which it cannot: the image installs `--no-dev` and `laravel/wayfinder` is
  a `require-dev` dependency, so `api-client:generate` is not a command that
  image can run. Nothing in the Dockerfile or entrypoint invokes it. The
  exclusion therefore protected nothing and cost the front-end images their
  ability to build at all, because `@fixmate/api-client` re-exports operations
  that import from those files. `api-client:check` is what actually keeps the
  client honest, and it runs in CI where PHP and the dev dependencies exist.
- **A `<dockerfile>.dockerignore` is not an option here.** BuildKit only honours
  one when the Dockerfile sits at the context root, and these Dockerfiles are
  addressed with `-f apps/<name>/Dockerfile` against a root context. Verified: a
  negation in `apps/user/Dockerfile.dockerignore` had no effect.
- **An `ARG` before the first `FROM` is not in scope inside a stage.** It must be
  re-declared in the stage that uses it, or it expands to nothing — the build
  succeeds and `NEXT_PUBLIC_API_URL` simply is not set. `lib/api.ts` throws at
  module load when the address is missing, which fails `next build` and is the
  only reason this is caught at build time rather than in a browser.
- **A session is two tokens, and the renewal token is the dangerous one.** The
  access token is in memory only and expires in minutes; the renewal token is in
  browser storage, where injected script can read it, so it carries only
  `session:renew` and is spent on use. A super administrator's renewal token
  carries no wildcard. `EnsureAccountCan` refuses any token carrying
  `session:renew` — removing that one line makes a renewal token reach
  `GET /users/me` with a 200, because that route names no ability and the
  account-type check alone waves it through. `EnsureSessionCan` is the mirror: it
  refuses anything that is *not* renewal-scoped, so an access token cannot drive
  renewal.
- **`SignOutController` has no `account.can`, and that is load-bearing.**
  `account.can` refuses renewal tokens, and an expired access token is the
  normal reason for signing out — so refusing the renewal token there would
  leave a working one in storage that signs the person straight back in.
  `ApiDocumentation` reads `session.can` as naming an account type for the same
  reason: the four renewal doors would otherwise be documented as guarding
  nothing, which is a false claim in the field a reader trusts.
- **Sign-out is not idempotent, and must not be made so.** A second attempt is a
  401, because the token it presents was revoked by the first. Returning 200
  would mean weakening `auth:sanctum` for one route. The client documents that a
  caller must treat the 401 as success.
- **Sign-in issues two tokens, so `assertDatabaseCount('personal_access_tokens', 1)`
  is wrong and there are several of them.** They were corrected, not deleted.
- **The session lives in `packages/session`, and its access-token holder is a
  separate object for a construction-order reason.** The client is built before
  the session exists, so the token lives in a `createAccessTokenSource()` holder
  that both read and write. The alternative is a closure over a `let session`
  that is undefined until two lines later.
- **`AccessTokenSource.presentAs` is how the renewal token is sent.** A renewal
  needs a bearer credential and there is no access token at that moment, so the
  holder temporarily carries the renewal token for the scope of one call and
  restores it in a `finally`. Setting it without a scope would present a
  browser-stored token to every later request.
- **`restore()` with no stored renewal token reports *no* reason, not
  `expired`.** It is reached on every first page load, so it is the most commonly
  seen state in the application; calling it an expiry greeted a first-time
  visitor with "your session has ended". Found by looking at a real page load.
- **The session provider is in the root layout, not per page.** The access token
  is in memory, so every page must restore on arrival. With the restore on the
  sign-in screen alone, reloading the landing page left the person signed out.
- **A scheduled renewal returns its promise** so a test can await it. It is
  `void`-ed by a real timer and by nothing else; without the promise a test
  awaits a task that returns immediately and asserts before the renewal lands.
- **`apps/user/Dockerfile` must copy every shared package's manifest *and*
  source.** Forgetting the source fails the build with "Module not found";
  forgetting the manifest fails `npm ci`, because the lockfile names a member
  whose package.json is absent. There are three shared packages now —
  `api-client`, `session`, `ui` — and each needs both lines.
- **`packages/ui` is the shared design system, and it imports nothing from
  `@fixmate/session`.** The shell takes `identity`, `abilities`, `sections` and
  `onSignOut` as props. That keeps the design system free of session opinions,
  makes the components testable without a session, and leaves the session layer
  free of opinions about headers. Each application wires the two together in one
  small file (`apps/user/app/dashboard-shell.tsx`); the other three are copies
  with three values changed.
- **The `@source` path in `globals.css` is three levels up and fails silently.**
  `@source '../../../packages/ui/src'` — resolved against `apps/user/app/`, not
  the workspace root. Two levels resolves to `apps/packages/ui`, which does not
  exist, and **Tailwind ignores a missing source with no warning**: the build
  succeeds and every class in the shell is simply absent. `apps/user/Dockerfile`
  therefore greps the compiled CSS for `max-w-5xl`, a class only `packages/ui`
  uses, so the image build fails instead of shipping an unstyled shell.
- **Tailwind does not follow the workspace symlink.** `@fixmate/ui` is reached
  through `node_modules/@fixmate/ui`, and Tailwind's scanner does not follow it,
  so the `@source` line is required rather than an optimisation.
- **Rendering the raw account type is a bug, and was one.** The back end's `me`
  answers `account_type: "users"` because that is what it routes on. Putting that
  on screen produced "Signed in as users"; `accountTypeLabel` in `@fixmate/ui`
  maps the four to the back end's own `AccountType::label()` strings, and a test
  asserts all four line up. Unknown values pass through rather than blanking —
  "signed in as whatever-this-is" is reportable, an empty header is not.
- **Navigation is filtered by ability, and the filter is a courtesy, not the
  control.** `EnsureAccountCan` is the control. `apps/user` deliberately lists an
  `accounts:read` section that a `users:*` token cannot reach, so the filter is
  proven to run on that application rather than passing because the list happened
  to contain nothing restricted. If abilities cannot be read they stay empty,
  which fails closed.
- **Component tests need `afterEach(cleanup)` written out.** Testing Library
  registers it only when vitest's `globals` are on, and `packages/ui` turns them
  off deliberately. Without it, renders accumulate and `getByRole` fails with
  "found multiple elements", which reads like a component bug.
- **jsdom, not happy-dom, for component tests.** The `@testing-library`
  accessibility queries rely on the accessibility tree; a partial implementation
  answers "is this a link?" wrongly often enough that a green suite would mean
  nothing.
- **Tab order follows visual order, so sign-out is reached before the
  navigation.** Asserted as a whole sequence rather than "the button is
  focusable", because a shell that skipped the navigation passes the weaker test.
- **Verified rather than assumed:** Lighthouse accessibility 1.0 on the sign-in
  screen and on the shell, no horizontal overflow at a 200% root font size, a
  correct `viewport` meta, and sign-out clearing storage and landing on
  `/sign-in/` with no "session ended" message — a deliberate sign-out is silent.
- **The sign-in response schema validates `renewal_token` and both expiries.**
  Without them a sign-in that returned no way to renew would produce a session
  that ends for no visible reason, and the symptom is very hard to trace.
  `signInResponse` keeps the historical `token` key while the renewal route is
  explicit about `access_token`; that asymmetry is deliberate.
- **A front end must not reword a refusal.** `describeSignInFailure` passes the
  back end's message through verbatim and rewrites only the two cases where the
  back end said nothing (`network`, `contract`). The sign-in refusal is
  deliberately indistinguishable between an unknown address, a wrong password
  and a suspended account, so a second wording in the front end is a second
  chance to leak which one it was.
- **`lib/sign-in-failure.ts` imports `ApiError` from `@fixmate/api-client`, not
  from `lib/api`.** `lib/api` builds the client at module load and throws
  without an address, so importing it would make the wording module unloadable
  and untestable. Same class object, so `instanceof` still matches.
- **Each application carries its own `Dockerfile`, and the nginx config is
  shared.** The four images are built, pushed and rolled back separately, so a
  single parameterised Dockerfile at the root is the wrong shape.
  `docker/front-end/default.conf` is shared instead, on the same reasoning that
  the API image shares `docker/nginx/default.conf`. When adding an application,
  copy `apps/user/`, do not fork the nginx config.
- **`nginx -t` is not enough to prove a config is used; `nginx -T` is.** `-t`
  only parses, so a config written to a directory the base image never includes
  passes it. The official `nginx` image includes `/etc/nginx/conf.d/*.conf`;
  `php:*-fpm-alpine` uses `/etc/nginx/http.d/`. Getting that wrong produced an
  image that started, reported healthy, and served nginx's welcome page instead
  of the export. `apps/user/Dockerfile` therefore greps `nginx -T` for the
  document root, and the check is demonstrated by rebuilding with the wrong
  path.
- **A `location /_next/static/` block needs `^~` or it never runs.** nginx
  evaluates regex locations before prefix locations, so without the modifier a
  fingerprinted `app.css` matches the generic `\.(css|js|…)$` block and gets
  seven days instead of `1y immutable` — the exact files the block exists for.
- **`apps/*/out` is in `.gitignore` as a scoped pattern, and must stay scoped.**
  A gitignore pattern with no slash matches at *any* depth, so a bare `out`
  would untrack the root `out/` rsync fixture. `.dockerignore` reaches the same
  conclusion by a different rule: there a slashless pattern matches the root
  only. The fixture is deliberately not in `.dockerignore` and travels into the
  API image; that is expected, and adding a bare `out` is how it would stop.
- **The application's own tests guard the export contract, and one of them
  caught a hole in itself.** `apps/user/test/static-export.test.ts` fails the
  build-relevant mistakes (dynamic route segments, `cookies()`/`headers()`)
  without needing a build to have run. Its first version checked only the top
  level of `app/` and passed with `app/bookings/[id]` in place. Demonstrating a
  guard by breaking the thing it guards is not optional here.
- **`next-env.d.ts` and `*.tsbuildinfo` are gitignored, not committed.** Both
  are written by `next build` and both reference `.next/`, so committing them
  breaks `npm run typecheck` on a clean checkout that has never been built.
- **`next build` rewrites `apps/user/tsconfig.json`** — it set `jsx` to
  `react-jsx` and added `.next/dev/types/**/*.ts` to `include`. That is expected
  and should not be reverted.
- **`apps/README.md` is load-bearing twice over:** `apps/` cannot be tracked
  empty, and it is where the per-application contract and the `out/` trap are
  written down. Do not treat it as a stray file.
- **A file inside a workspace package can import the package by its own
  `@fixmate/*` name without the workspace link existing**, because Node,
  TypeScript and Vite all resolve a package's own name through its own `exports`
  map. So a bare import proves nothing about the workspace. That is why
  `packages/api-client/test/workspace.test.ts` asserts the
  `node_modules/@fixmate/api-client` link itself, walking up from the test file
  the way Node does; deleting the link fails those two tests and leaves the
  imports passing. Do not replace that with an import and call it coverage.
- **`src/generated/` under a package is never committed.** It is produced by
  `php artisan api-client:generate` (gitignored, and `.dockerignore`d so a host
  copy cannot leak in). Anything hand-written must live outside
  `src/generated/`, because Wayfinder prunes every file it did not write from
  the directories it owns.
- **`config/view.php` and `storage/framework/views` are kept on purpose.** The
  framework's `ViewServiceProvider` is in the default provider list and its
  `view.finder` takes `array $paths`, so deleting the config turns a harmless
  'no views' situation into a `TypeError` wherever `view` is resolved — which
  includes `laravel/mcp` calling `loadViewsFrom`. Deleting them buys nothing;
  the `resources/` directory is already gone, so no view can be found anyway.

## Agent skills

Project skills live in `.opencode/commands/<name>/SKILL.md` and are committed.
Two of them are prefixed `fixmate-` (`fixmate-laravel-best-practices`,
`fixmate-tailwindcss-development`) because an unprefixed name already exists in
`~/.config/opencode/skills/`; OpenCode resolves skills by name, so a duplicate
silently shadows one of them. Keep names unique across project and global scope,
and keep the frontmatter `name:` equal to its directory name.

### Issue tracker

Issues and specs live in GitHub Issues on `BeAhsan/FixMate`, operated through the
`gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels, used under their default names. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. Neither exists
yet — both are created lazily by `/domain-modeling`, so their absence is not a
problem to go and fix. See `docs/agents/domain.md`.

### Specs

Design documents live in `docs/specs/`, one numbered file each, indexed in
`docs/specs/README.md`. A spec file is the source of truth and is versioned with
the code; the GitHub issue is the work queue and links to the file rather than
duplicating it. See `docs/specs/README.md`.

<laravel-boost-guidelines>
=== foundation rules ===

# Laravel Boost Guidelines

The Laravel Boost guidelines are specifically curated by Laravel maintainers for this application. These guidelines should be followed closely to ensure the best experience when building Laravel applications.

## Foundational Context

This application is a Laravel application running on PHP 8.5. You are an expert with the Laravel ecosystem. Always use the APIs that match the installed major version of each package — do not assume a version.

Before relying on a package's API, confirm its installed version:
- PHP packages: run `composer show --direct` to list direct dependencies with versions, or `composer show <vendor/package>` for a single package.
- JS packages: check `package.json` for the installed versions.

## Skills Activation

This project has domain-specific skills available in `**/skills/**`. You MUST activate the relevant skill whenever you work in that domain—don't wait until you're stuck.

## Conventions

- You must follow all existing code conventions used in this application. When creating or editing a file, check sibling files for the correct structure, approach, and naming.
- Use descriptive names for variables and methods. For example, `isRegisteredForDiscounts`, not `discount()`.
- Check for existing components to reuse before writing a new one.

## Verification Scripts

- Do not create verification scripts or tinker when tests cover that functionality and prove they work. Unit and feature tests are more important.

## Application Structure & Architecture

- Stick to existing directory structure; don't create new base folders without approval.
- Do not change the application's dependencies without approval.

## Frontend Bundling

- If the user doesn't see a frontend change reflected in the UI, it could mean they need to run `npm run build`, `npm run dev`, or `composer run dev`. Ask them.

## Documentation Files

- You must only create documentation files if explicitly requested by the user.

## Replies

- Be concise in your explanations - focus on what's important rather than explaining obvious details.

=== boost rules ===

# Laravel Boost

## Tools

- Laravel Boost is an MCP server with tools designed specifically for this application. Prefer Boost tools over manual alternatives like shell commands or file reads.
- Use `database-query` to run read-only queries against the database instead of writing raw SQL in tinker.
- Use `database-schema` to inspect table structure before writing migrations or models.
- Use `get-absolute-url` to resolve the correct scheme, domain, and port for project URLs. Always use this before sharing a URL with the user.
- Use `browser-logs` to read browser logs, errors, and exceptions. Only recent logs are useful, ignore old entries.

## Searching Documentation (IMPORTANT)

- Use `search-docs` before changes that depend on Laravel ecosystem APIs, behavior, configuration, or version-specific syntax. Skip it for copy-only edits and other changes where package documentation is irrelevant. Reuse sufficient results already in context instead of searching again.
- Pass a `packages` array to scope results when you know which packages are relevant.
- Use multiple broad, topic-based queries: `['rate limiting', 'routing rate limiting', 'routing']`. Expect the most relevant results first.
- Do not add package names to queries because package info is already shared. Use `test resource table`, not `filament 4 test resource table`.

### Search Syntax

1. Use words for auto-stemmed AND logic: `rate limit` matches both "rate" AND "limit".
2. Use `"quoted phrases"` for exact position matching: `"infinite scroll"` requires adjacent words in order.
3. Combine words and phrases for mixed queries: `middleware "rate limit"`.
4. Use multiple queries for OR logic: `queries=["authentication", "middleware"]`.

## Project Rules

- This project contains committed, area-grouped rules in `.ai/rules` when that directory exists (settled decisions, non-obvious traps, standing constraints). Framework and package guidelines that only apply to specific paths (testing, frontend, components) also live there, under `.ai/rules/boost` — this is not just recorded decisions, it is load-bearing guidance you have not seen inline. Before you enter plan mode or create/edit any file, you MUST first: open @.ai/rules/index.md (it maps file globs to rule files), read every rule file whose globs cover the path(s) in scope, and run `grep -rin 'keyword' .ai/rules` to catch what a path match alone misses. Do not write code until you have read and are following every matching rule. If `.ai/rules` does not exist, continue without it.
- Record a rule with `record-rule` only when the user explicitly asks for one. Instructions for the work at hand are not rules, no matter how emphatic: "remove this typo", "use X here" are work to do, not rules to record. Never record a rule on your own initiative, as a byproduct of a change, or to summarize what you just did. When the user does ask, pass a `glob` (e.g. `app/Http/Controllers/**`), a short `title`, and a few-line `note`. Use `record-rule` rather than your native memory or notes tool, because native memory is personal and session-scoped, while only `.ai/rules` is shared with the team and persists in the repo.

## Artisan

- Run Artisan commands directly via the command line (e.g., `php artisan route:list`). Use `php artisan list` to discover available commands and `php artisan [command] --help` to check parameters.
- Inspect routes with `php artisan route:list`. Filter with: `--method=GET`, `--name=users`, `--path=api`, `--except-vendor`, `--only-vendor`.
- Read configuration values using dot notation: `php artisan config:show app.name`, `php artisan config:show database.default`. Or read config files directly from the `config/` directory.

## Tinker

- Execute PHP in app context for debugging and testing code. Do not create models without user approval, prefer tests with factories instead. Prefer existing Artisan commands over custom tinker code.
- Always use single quotes to prevent shell expansion: `php artisan tinker --execute 'Your::code();'`
  - Double quotes for PHP strings inside: `php artisan tinker --execute 'User::where("active", true)->count();'`

=== php rules ===

# PHP

- Always use curly braces for control structures, even for single-line bodies.
- Use PHP 8 constructor property promotion: `public function __construct(public GitHub $github) { }`. Do not leave empty zero-parameter `__construct()` methods unless the constructor is private.
- Use explicit return type declarations and type hints for all method parameters: `function isAccessible(User $user, ?string $path = null): bool`
- Use TitleCase for Enum keys: `FavoritePerson`, `BestLake`, `Monthly`.
- Prefer PHPDoc blocks over inline comments. Only add inline comments for exceptionally complex logic.
- Use array shape type definitions in PHPDoc blocks.

=== deployments rules ===

# Deployment

- Laravel can be deployed using [Laravel Cloud](https://cloud.laravel.com/), which is the fastest way to deploy and scale production Laravel applications.
- Activate the `deploying-to-cloud` skill whenever deploying to Laravel Cloud, configuring Cloud environments or resources, using the Cloud CLI, or troubleshooting Cloud deployments.

=== laravel/core rules ===

# Do Things the Laravel Way

- Use `php artisan make:` commands to create new files (i.e. migrations, controllers, models, etc.). You can list available Artisan commands using `php artisan list` and check their parameters with `php artisan [command] --help`.
- If you're creating a generic PHP class, use `php artisan make:class`.
- Pass `--no-interaction` to all Artisan commands to ensure they work without user input. You should also pass the correct `--options` to ensure correct behavior.

### Model Creation

- When creating new models, create useful factories and seeders for them too. Ask the user if they need any other things, using `php artisan make:model --help` to check the available options.

## APIs & Eloquent Resources

- For APIs, default to using Eloquent API Resources and API versioning unless existing API routes do not, then you should follow existing application convention.

## URL Generation

- When generating links to other pages, prefer named routes and the `route()` function.

## Testing

- When creating models for tests, use the factories for the models. Check if the factory has custom states that can be used before manually setting up the model.
- Faker: Use methods such as `$this->faker->word()` or `fake()->randomDigit()`. Follow existing conventions whether to use `$this->faker` or `fake()`.
- When creating tests, make use of `php artisan make:test [options] {name}` to create a feature test, and pass `--unit` to create a unit test. Most tests should be feature tests.

## Vite Error

- If you receive an "Illuminate\Foundation\ViteException: Unable to locate file in Vite manifest" error, you can run `npm run build` or ask the user to run `npm run dev` or `composer run dev`.

=== pint/core rules ===

# Laravel Pint Code Formatter

- If you have modified any PHP files, you must run `vendor/bin/pint --dirty --format agent` before finalizing changes to ensure your code matches the project's expected style.
- Do not run `vendor/bin/pint --test --format agent`, simply run `vendor/bin/pint --format agent` to fix any formatting issues.

=== phpunit/core rules ===

# PHPUnit

- This project uses PHPUnit. Create tests with `php artisan make:test --phpunit {name}`.
- Do not include the test suite directory in `{name}`. Use `SomeFeatureTest`, not `Feature/SomeFeatureTest`.
- Read the `testing-best-practices` skill for guidance on coverage, naming, structure, dependency isolation, and review.

## Running Tests

- Run the narrowest set of tests that covers the change. Pass a file path or `--filter=testName` to `php artisan test --compact`.
- Rerun a test after each change to it.
- Run `vendor/bin/phpunit` to call the test runner directly. It accepts the same file path and `--filter=testName` arguments.

</laravel-boost-guidelines>
