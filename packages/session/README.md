# packages/session

The session layer all four applications share. The one place that knows a
session is two tokens.

## What it is for

A static export has no server-side session and no way to set an httpOnly cookie
from application code, so the access token has nowhere safe to live except a
variable. It is held in memory, is never written to storage, and expires in
minutes. None of that would be a usable session on its own — a page reload
destroys it — so a **renewal token** exists purely to get a new one.

The two tokens are not variations on a theme. They have opposite trade-offs:

| | Access token | Renewal token |
| --- | --- | --- |
| Lives | a variable | browser storage |
| Readable by injected script | no | **yes** |
| Lifetime | minutes | hours |
| Can do | whatever the account may do | mint one access token, once |
| Rotated | every renewal | every use |

The renewal token is the only credential in the platform that a script
injection can read, which is why it is worth so little. It is spent the moment
it is used, and the back end refuses it on every route except the renewal one.

## Using it

An application supplies a *definition* and gets three components back:

```ts
// apps/user/lib/application.ts — the whole application
export const { session, SessionProvider, ApplicationShell, SignInScreen } =
    createApplication({
        application: 'user',
        applicationLabel: 'FixMate',
        baseUrl: resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL),
        sections,
        subject: 'end user',
    })
```

```tsx
// apps/user/app/page.tsx
<ApplicationShell>
    <Card title="Welcome">…</Card>
</ApplicationShell>
```

`createApplication` builds the client, binds the four operations this key allows,
creates the session, and returns the components. An application names **no
operation, no account type, and no URL** — which is what makes "a front end
physically cannot reach another application's door" true rather than a convention.
`tests/Feature/FrontEndApplicationsTest.php` enforces it across the repository.

The React layer is **Next-aware on purpose**. The sign-in flow has to redirect, and
that needs `useRouter` and `useSearchParams`; leaving them out would mean each of
the four applications re-implementing the redirect, which is the duplication this
package exists to prevent. It also means the session package is Next-specific,
which is a real cost and the right trade for four identical Next applications.

## `createSession` on its own

`createApplication` is a convenience over three pieces that can be used directly:

```ts
const tokens = createAccessTokenSource()
const client = createApiClient({ baseUrl, getAccessToken: tokens.get })

const session = createSession({
    tokens,
    store: webStorageRenewalTokenStore('fixmate.user.renewal'),
    operations: { signIn, renew, signOut, whoAmI },
})
```

- **`tokens`** is required rather than created internally, because the client is
  built first and has to read it. The alternatives are a closure over a `session`
  variable that does not exist yet, or a setter on the client — both spread the
  token across two objects. See `createAccessTokenSource`.
- **`whoAmI`** is part of the operations because two things need the account and
  neither should have to remember to ask: the shell names the live account type,
  and the navigation is filtered by ability. A failure leaves the abilities
  **empty**, which hides every ability-scoped section rather than offering one
  that will be refused.
- **`store`** is the renewal-token arrangement, and the seam the whole design
  turns on.

## The cookie seam

`RenewalTokenStore` has two shapes, and that is the point rather than an
awkwardness:

```ts
{ kind: 'held-by-client'; read(); write(token); clear() }   // Web Storage, today
{ kind: 'sent-automatically'; clear() }                     // httpOnly cookie, later
```

The second has no `read` and no `write`, because there is no token for the
client to read — the browser sends it. A single interface with all three methods
would have to pretend otherwise, and returning `null` from a `read` that cannot
succeed is exactly the kind of thing that gets mistaken for "signed out".

So acquiring a domain name is a change to this package and to the back end's
CORS credentials setting. The four applications pass a different store and change
nothing else.

It cannot be switched on yet, and the reason is worth stating: the four
applications are served from four different origins, so they cannot share one
parent-domain cookie. Until there is a domain name, a per-origin cookie gains
nothing over Web Storage.

## Signing out in one application, everywhere

`signOut()` calls the back end, which revokes **every** token the account holds.
A front end cannot reach into another application's memory to clear it, so the
only thing that can end a session elsewhere is server-side revocation. This is
also why the renewal tokens are revoked too — otherwise a page load would undo
the sign-out seconds after it was asked for.

A second sign-out is a 401, and callers must treat it as the success it is. See
`SignOutController` for why it is not made idempotent.

## Commands

```sh
npm run build --workspace=@fixmate/session      # tsc --noEmit
npm run typecheck --workspace=@fixmate/session
npm test --workspace=@fixmate/session           # vitest run
```

The tests drive a **real** API client with an injected `fetch` and a fake clock.
A hand-written stub for the operations would have been easier and would have
proved less: the wiring between the session, the client and the declared response
shapes is where a session bug lives. Silent renewal is asserted by running the
scheduled task by hand rather than by waiting fifteen real minutes — and the
scheduled task returns its promise specifically so a test can await it.
