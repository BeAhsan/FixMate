# FixMate — agent notes

Everything below is verified against this repo. Where the README disagrees with
the code, the code wins and the README is named as the stale one.

## What this repo is

- A Laravel 13 app (`laravel/framework` 13.33) that is a **JSON API and nothing
  else**. There is no Blade, no Vite, and no route that renders a page:
  `routes/api.php` is the only route file and `resources/` does not exist. npm
  exists (a workspaces root, one shared package) but there is no front-end
  *application* in this repository yet — do not assume a feature area, model or
  endpoint exists beyond the one end-user sign-in route.
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

Gate order matches the Jenkins `Verify` → `Test` stages — **Pint first**, then
tests:

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
```

`api-client:check` is the check that catches a renamed route. Changing a route
means changing `routes/api.php`, `packages/api-client/contract.json` and
`packages/api-client/src/operations.ts` together, or the check fails. The
TypeScript side:

```sh
npm install                             # once, from the root
npm run typecheck
npm test
```

Both need `php artisan api-client:generate` to have run first, because
`src/generated/` is not committed and the TypeScript imports it.

CI runs `pint --test`, so an unformatted file is caught by CI rather than by you.

Reproduce the CI stages in one shot, with no MySQL or Redis needed:

```sh
docker build --target test -t fixmate/app:ci . && docker run --rm fixmate/app:ci
```

That target's `CMD` is `php artisan test`, so `docker run` with no argument runs
the suite.

**Tests need no services.** `phpunit.xml` pins `DB_CONNECTION=sqlite` and
`DB_DATABASE=:memory:`, so the suite never touches a real database. The local
`database/database.sqlite` — gitignored via `database/.gitignore` (`*.sqlite*`) —
is only what a host-side `php artisan serve` uses, because `.env` selects sqlite.

### Two CI systems, one gate

`.github/workflows/laravel.yml` and the Jenkins `Verify`/`Test` stages run the
same checks — Pint, then the suite, on the same PHP version. It is a
pull-request gate and nothing more: it does not build or push the image, because
Jenkins pushes straight to `ghcr.io` from the controller. If you add a check, add
it in both places or neither.

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
- **There are no front-end *applications* in this repository yet.** There is now
  a root `package.json` (npm workspaces: `apps/*`, `packages/*`) and one shared
  package, `packages/api-client`. The four Next.js applications arrive later and
  populate `apps/`. Still no `resources/`, no `public/build`, no Vite — and
  **still do not add a front-end build step to the image**, which builds one
  image that serves three roles from the same workspace.
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
