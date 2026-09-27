# apps/worker — the worker application

One of the four front ends. It is a copy of `apps/user` with three values
changed, and the copy is the point: the four exist as separate images so they can
be deployed and rolled back separately, not so they can be four different
programs.

## What is here

| Path | What it is |
| --- | --- |
| `lib/application.ts` | **The application.** Its key, its address, its navigation, three strings of copy. |
| `app/layout.tsx` | The document, and the session provider. |
| `app/page.tsx` | The dashboard — the only content in the application. |
| `app/sign-in/page.tsx` | A delegation to the shared sign-in screen. |
| `Dockerfile` | Its own image, built from the repository root. |
| `test/static-export.test.ts` | Identical in all four, and the one file that genuinely is a copy. |

There is no sign-in flow, no shell, no session handling and no `fetch` call in
this directory. `tests/Feature/FrontEndApplicationsTest.php` fails the build if
any of those appear, and it is the reason they do not.

## The door it uses

`application: 'worker'` is the whole of it. That key is what
`OPERATIONS_BY_APPLICATION` in `@fixmate/session` turns into four operations —
sign in, renew, sign out, and who-am-I — all bound to the `workers` store.

This application **cannot** reach another application's door, because it has no way
to name one: no operation is reachable from here except its own four. The only
thing that could stop it if that changed is the back end's `account.can`, and
that is a control rather than a convention.

The abilities it holds are `worker:*`, which is why every section in its
navigation is reachable and none is hidden.

## Building it

```sh
docker build -f apps/worker/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 \
  -t fixmate/worker-app:<sha> .
```

Published on port **3001** in development, and that port is the origin
`config/applications.php` names for this application — so a request from
`http://localhost:3001` is one the back end's allowed-origins list grants, and
a request from anywhere else is not. That is why the port is not arbitrary.

The build asserts three things about itself: that the export produced an
`index.html`, that the shared package's Tailwind classes reached the compiled CSS,
and that no source is present in the image. See `apps/user/README.md` for what
each of those is guarding against.
