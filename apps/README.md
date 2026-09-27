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

**All four exist.** `user/` is the reference the other three are copies of, and
each is a deployable image in its own right. What differs between them is
`lib/application.ts` — a key, an address, a navigation, and three strings of copy.

That is the whole claim of this repository's front end, and it is **enforced**,
not merely intended: `tests/Feature/FrontEndApplicationsTest.php` fails the build
if any application grows a `<form>`, a `fetch`, a router call, its own `<header>`,
or a reference to another account type's operations. The files that *are* allowed
to be byte-identical are listed by name in that test, each with a reason, and the
same test fails if an entry on that list stops being true.

The directory exists in git because of this file as well as because of the four
applications: git cannot track an empty directory, so without something committed
here a fresh clone would have no `apps/` at all and the `apps/*` workspace glob
would match nothing.

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

## Every application carries its own container

Each of the four has a `Dockerfile` **in its own directory**, and each builds to
its own image. There is no shared front-end Dockerfile at the repository root
taking an application name as an argument.

The reason is that the four are deployed independently. They are built,
tagged, pushed, health-checked and rolled back as four separate versions, and
the release record is the set of five versions rather than one — a back end
whose contract has moved while a front end has not is an application nobody can
sign in to. A single parameterised Dockerfile would be less duplication, but it
would make the four images a product of one file, and the whole point of the
arrangement is that they are not.

What *is* shared is the nginx configuration, at
`docker/front-end/default.conf`, on the same reasoning that the API image shares
`docker/nginx/default.conf`. The server is the same for all four, because all
four serve a directory of files. What differs between them is the export that
gets copied in, which is the Dockerfile's business.

So when the fourth application arrives, the work is: copy `user/`, change the
package name, the labels and the `ARG NODE_VERSION` if the others need it. The
nginx config is not copied and must not be forked per application.

## The `out/` trap

A Next.js static export (`output: 'export'`) writes to `out/`, so an
application's build output is `apps/user/out`. There is also an `out/` at the
**repository root**, and that one is not front-end output: it is an rsync test
fixture committed to prove the `--delete` staging fix in the `Jenkinsfile`.

They are different directories and the root one stays. Two consequences:

- `.gitignore` must never grow a **bare** `out`. A gitignore pattern with no
  slash matches at any depth, so a bare `out` would swallow the root fixture as
  well as the real output. The entries there are scoped —
  `apps/*/out`, `apps/*/.next` — which is why the trap has to be stated rather
  than left to a future reader who has not been bitten by it.
- `.dockerignore` scopes its exclusion to `apps/*/out` for the same reason, and
  a bare `out` there would mean something different again: Docker matches a
  slashless pattern against the **root only**. The API image's exclusion must
  not quietly become a second opinion about a directory that is none of its
  business.

The `out/` fixture is deliberately absent from `.dockerignore`, so it travels
into the API image on every build. That is harmless and expected. A bare `out`
in an ignore file is how it would start *not* travelling, which is a different
kind of wrong.
