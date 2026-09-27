# apps/

The four deployed front ends. Shared code does not live here — it lives in
`packages/`, and everything below imports from there rather than from each
other.

| Application | Client | Sign-in store |
|---|---|---|
| `user` | the end user | `users` |
| `worker` | the worker | `workers` |
| `admin` | the administrator | `admins` |
| `super-admin` | access management | `super admins` |

**This directory holds no application yet.** The workspace was stood up first,
on purpose, so that the first application is added to a structure already known
to install, resolve and build. Ticket 14 adds the first of the four; the rest
follow.

The directory exists in git only because of this file: git cannot track an empty
directory, so without something committed here a fresh clone would have no
`apps/` at all and the `apps/*` workspace glob would match nothing.

## What an application has to satisfy

An application is an npm workspace member, so the root `npm install` installs
its dependencies and the root commands reach it with no further wiring. It needs
to declare:

- `build` — the single command that must succeed. See the root `README.md`.
- `typecheck` — `tsc --noEmit`, for the same reason the API client has one.
- `test` — the application's own tests.

Nothing else is required of it, and in particular it does not get a
front-end-aware Docker build for free: the API image has no Node in it, and it
is not going to grow one. Each application is built and shipped by its own
pipeline.

## The `out/` trap

A Next.js static export (`output: 'export'`) writes to `out/`, so an
application's build output is `apps/user/out`. There is also an `out/` at the
**repository root**, and that one is not front-end output: it is an rsync test
fixture committed to prove the `--delete` staging fix in the `Jenkinsfile`.

They are different directories and the root one stays. Two consequences:

- `.gitignore` has no `out` entry, and must not grow one. Adding it would
  silently untrack the fixture.
- `.dockerignore` scopes the exclusion to `apps/*/out` rather than writing a
  bare `out`, so the API image's exclusion cannot quietly become a second
  opinion about a directory that is none of its business.
