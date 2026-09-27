# apps/user — the end user application

One of the four front ends. This is the first of them, and the reference the
other three are copies of: the same shape, the same commands, the same
container.

It is a **static export**. `next.config.ts` sets `output: 'export'`, so
`next build` writes a directory of HTML, CSS and JavaScript and nothing else.
There is no Node process at runtime and no application server, which is what
makes the image below possible and what makes the deployed footprint a few
megabytes of nginx rather than a running application.

It talks to the back end. It calls the generated typed client — never a
hand-written URL — through `lib/api.ts`, which is the only module in this
application that knows the API exists. The sign-in screen is at
`/sign-in/`, and the token it receives is held in memory by `lib/session.ts`
and nowhere else.

## The back end's address is fixed at build time

`NEXT_PUBLIC_API_URL` is inlined into the bundle by the build, so one image is
built for one back end:

```sh
docker build -f apps/user/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 \
  -t fixmate/user-app:<sha> .
```

`lib/api.ts` throws at module load if it is unset, which fails `next build`
rather than producing an image that cannot sign anyone in. That is deliberate,
and it is how a missing build argument was caught here: a `docker build --build-arg`
that is not re-declared inside the build stage expands to nothing, the build
still succeeds, and the only symptom is a blank screen in a browser.

## Commands

Run from the repository root, or with `--workspace=@fixmate/user-app`:

```sh
npm run build      # next build, writing the export to out/
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

`out/` is build output and is never committed. So is `.next/`, `next-env.d.ts`
and `tsconfig.tsbuildinfo` — the last two because they reference `.next/types`,
so committing them breaks `typecheck` on a clean checkout that has never been
built.

The root `npm run build` runs this application's build as part of
`npm run build --workspaces`. It does not pass `--if-present`, so an application
without a `build` script fails the root build rather than being skipped.

## The image

The Dockerfile is **in this directory**, one per application, because each of
the four is built, tagged, pushed, deployed and rolled back as its own image.
The other three are copies of this file differing in two `ARG`s and the labels.

The one thing not copied is the nginx configuration, which lives at
`docker/front-end/default.conf` and is shared: the server is the same for all
four, since all four serve a directory of files.

The build context is the **repository root**, not this directory:

```sh
docker build -f apps/user/Dockerfile -t fixmate/user-app:<sha> .
```

That is not a convenience. This is an npm workspace — the root `package.json`
declares `apps/*` and `packages/*`, npm hoists the installed tree to the root,
and `npm ci` resolves a lockfile naming every member. A context of `apps/user`
would install one package with no lockfile and no knowledge of the workspace.

## Verifying it, which is the point of the ticket

The build asserts its own two claims, so a broken image cannot be built in the
first place:

- `nginx -T` is grepped for this server's document root, which proves the
  config was actually **included**. `nginx -t` is not enough — it only parses,
  and it passes on a config written to a directory the base image never reads.
  That mistake shipped once here and produced an image that started, reported
  healthy and served nginx's welcome page.
- `find` asserts no `*.tsx` or `next.config.*` is anywhere in the image, so a
  future `COPY . .` cannot quietly put the source back.

Neither proves the page *renders*. Only fetching it does:

```sh
docker build -f apps/user/Dockerfile -t fixmate/user-app:verify .
docker run --rm -d --name user-app -p 18081:80 fixmate/user-app:verify
sleep 8

curl -s http://127.0.0.1:18081/ | grep -o 'data-export-marker="user-app"'
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18081/up
docker inspect user-app --format '{{.State.Health.Status}}'

docker rm -f user-app
```

The `data-export-marker` attribute on the landing page is what the first
command greps for. It is a real attribute rather than a comment because a
comment would not survive minification, and its absence would be
indistinguishable from a build that silently stopped rendering.

`/up` answers 200 from the export's own `index.html`, so the health check
proves the application is being served rather than that a port is open.

## What is deliberately not here yet

- **The session layer** (ticket 16): the renewal token, silent renewal, and
  the signed-in state exposed to the application. Until then a page reload signs
  the person out, which is the honest consequence of holding the access token in
  memory only.
- **The application shell** (ticket 17): header, navigation, sign-out. The
  landing page is plain on purpose, so the difference the shell makes is
  visible when it arrives.
- **A Docker Compose service** (ticket 21) and **a pipeline stage** (ticket 24).
  The image is built and verified here; nothing deploys it yet.

## Verifying a sign-in end to end

The check that matters is a real one, and it needs three things running: the
API, the image, and a browser.

```sh
# 1. An API with an account in the users store.
php artisan migrate:fresh
php artisan tinker --execute '
  $u = App\Models\User::firstOrNew(["email" => "ada@example.test"]);
  $u->name = "Ada Lovelace";
  $u->password = bcrypt("correct-horse-battery");
  $u->status = "active";
  $u->save();'
php artisan serve --port=8000

# 2. The image, on the port config/applications.php names for this application.
docker build -f apps/user/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 \
  -t fixmate/user-app:verify .
docker run --rm -d --name user-verify -p 3000:80 fixmate/user-app:verify

# 3. Open http://localhost:3000/sign-in/ and sign in as ada@example.test.
```

The port matters and is not incidental: `3000` is this application's address in
`config/applications.php`, and a browser will refuse to hand the response to the
page from any other origin. Seeing the sign-in succeed is therefore also the
proof that the allowed-origins list names this application.

Two failures worth watching for, because both were real here:

- **The message on a wrong password is the back end's**, verbatim —
  "These credentials do not match our records." The application does not
  paraphrase it, because that refusal is deliberately indistinguishable between
  an unknown address, a wrong password and a suspended account.
- **A 200 with the wrong shape is reported as a broken contract**, not as a
  wrong password. A status code cannot catch that one, so it is worth seeing
  once: stand a stub on port 8000 that answers `200 {"data":"signed-in"}` and
  the screen says the service replied in a shape it does not recognise.
