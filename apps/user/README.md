# apps/user — the end user application

One of the four front ends. This is the first of them, and the reference the
other three are copies of: the same shape, the same commands, the same
container.

It is a **static export**. `next.config.ts` sets `output: 'export'`, so
`next build` writes a directory of HTML, CSS and JavaScript and nothing else.
There is no Node process at runtime and no application server, which is what
makes the image below possible and what makes the deployed footprint a few
megabytes of nginx rather than a running application.

It does not talk to the back end yet. That is ticket 15, and it is also the
ticket that adds `@fixmate/api-client` as a dependency — which is why this
image needs no PHP: the generated client is produced in the pipeline, in a
throwaway PHP container, before the front-end images are built.

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

- **Sign-in** (ticket 15) and the **session layer** (ticket 16). The access
  token will be held in memory only, never in local storage, because a static
  export has no server-side session and no way to set an httpOnly cookie from
  application code.
- **The application shell** (ticket 17): header, navigation, sign-out. The
  landing page is plain on purpose, so the difference the shell makes is
  visible when it arrives.
- **A Docker Compose service** (ticket 21) and **a pipeline stage** (ticket 24).
  The image is built and verified here; nothing deploys it yet.
