# Spec: Super administrator account directory — one list of every account in the platform

## Problem Statement

Spec 0001, story 40: as a super administrator, I want to see every account across
all four account types in one place, with each one's status, so that I can audit
who has access anywhere in the system.

The back end already answers that question. `GET /api/v1/identity/accounts` is
routed, guarded by `account.can: super_admins` plus `accounts:read`, served by
`IndexAccountsController` through the `ListAllAccounts` use case and the
`AccountSummaryResource`, and covered end to end by
`tests/Feature/SuperAdministerAccountsTest.php`. The contract declares it
(`contract.json`, `openapi.json`), and the API client package already carries the
generated route function and a validated response schema for it. Nothing on the
back end needs to change.

The front end is the gap, and it is narrower than it looks. The super
administrator application's navigation already offers "All accounts" at
`/accounts/`, gated on `accounts:read` — but the page does not exist, so the
section is a link to a 404. The client-side reason is precise: the operation's
definition (`definitions.listAccounts`) exists in `packages/api-client`, but the
`Operations` interface does not declare it and `createOperations` does not
implement it — the definitions were added "because the contract declares them",
with a comment saying the dashboards are shells and nothing imports them yet.
And even a fully exposed operation would be unreachable, because the session
layer binds each application exactly five operations (sign-in, renew, sign-out,
who-am-I, change-password) and hands the application nothing else.

So the work is: expose one existing definition, bind it to one application, and
render one page. Building from the back end out is deliberately the wrong order
here; everything below the page is already built and tested.

## Solution

Three layers, each the smallest change that gives the next layer what it needs:

**The API client exposes the operation.** `listAccounts` is added to the
`Operations` interface and implemented in `createOperations` against the
existing definition; the `AccountSummary` type is exported from the package
entry so the layers above can name it. The drift check
(`api-client:check`) already asserts the client matches `contract.json`, which
already lists this operation — so exposing it closes a gap rather than opening
one.

**The session layer binds it to one application.** The super-admin entry of
`OPERATIONS_BY_APPLICATION` names `listAccounts`; the other three entries gain
nothing. `operationsFor` becomes generic over the application key and returns
the five session operations plus whatever extras that application's entry names.
The session itself consumes only the five — the extra operation rides alongside
for the application to use.

**The application renders the directory.** A page at `app/accounts/page.tsx`
fetches through `operations.listAccounts()` and renders an accessible table:
account type, name, email, status — with client-side search (name or email) and
an account-type filter, and the four states the dashboards are required to have
(loading, empty, failure with retry, and content).

The response arrives grouped by account type, then by identifier within each
type. That order is kept on screen rather than re-sorted: it is the order the
back end chose so that a person comparing two moments sees rows in the same
places, and re-sorting it in the browser would spend that property.

## User Stories

Builds on stories 40 (the directory), 50 (navigation shows only reachable
sections), 52–54 (loading, failure, empty states) and 57–61 (responsive,
keyboard, zoom, shared visual language) of spec 0001. New for this page:

1. As a super administrator, I want every account of every type in one table
   with its type, name, email and status, so that "who has access anywhere" is
   one question with one answer.
2. As a super administrator, I want suspended and pending accounts in the list,
   so that a suspension is never indistinguishable from a deletion.
3. As a super administrator comparing two moments, I want the list in a stable,
   total order, so that rows stay in the same places.
4. As a super administrator looking for one person, I want to search by name or
   email, so that I do not scan a long table.
5. As a super administrator, I want to filter the list by account type, so that
   I can read "the administrators" as a block.
6. As a super administrator whose directory fails to load, I want the failure
   told plainly with a way to retry, so that a transient error is not a dead
   end.
7. As a super administrator using a screen reader, I want a captioned table with
   column headers and statuses written in words, so that the directory is
   readable without colour or sight.
8. As an end user, worker or administrator, I want the directory refused to me
   by the back end and not offered to me by the application, so that the
   interface hides what the server would refuse.

## Implementation Decisions

### The operation is exposed, not re-invented

`definitions.listAccounts` already resolves the generated route and validates
the response against the declared directory shape. The interface method and the
`createOperations` implementation are the whole change. The operation returns
the unwrapped `data` array, like every other operation; an empty directory is a
200 with an empty array, which the page renders as an empty state and never as
an error.

### One type on the front end, four on the back end

The back end builds each row from a separate per-type summary type precisely so
that a staff-only field cannot leak into a shared representation. The front end
declares one `AccountSummary` because the four are currently identical in shape.
`operations.ts` already carries the comment recording this simplification's
shelf life — the day one summary type gains a field, the front end is the place
that splits into four. This spec ratifies that arrangement rather than
re-deciding it.

### The binding is per application, and the type system enforces it

`operationsFor` narrows by application key: for `user`, `worker` and `admin`,
`listAccounts` is not merely refused by the back end — it is not a name the
application can hold. The repo-wide test bans the sixteen session operation
names in application source; applications receive extras through
`createApplication`'s return value and never name them. `createApplication`
becomes generic over its application key and returns the narrowed operations
alongside the components it already returns. The session consumes only the five
session operations, so an application that never imports `operations` changes
nothing.

### The page is presentation plus one effect

The application is a static export: no dynamic segments, no request-time reads,
no server-side data fetching. The page is a client component that fetches in a
`useEffect` guarded by a `cancelled` flag — the same pattern `SessionProvider`
uses — through `operations.listAccounts()` and never through `fetch`. The
access token, silent renewal, and error normalisation belong to the API client
and the session; the page owns none of them.

The presentational component (`AccountsScreen`: props in, markup out) is
exported from the page module so tests can render it with
`renderToStaticMarkup` — no router, no network — which is the style the
`packages/session` screen tests already establish.

### Filtering is client-side

The endpoint is unpaginated and returns the whole directory. At the current
scale the entire directory is the right payload, and search and type filtering
run against it in the browser. Server-side pagination and filtering are named
in Out of Scope with the trigger for revisiting them, so the decision to filter
client-side is recorded rather than accidental.

### Status is a word, not a colour

`active`, `suspended` and `pending` render as badges that carry the word in
them, so the meaning survives without colour vision. An unrecognised status
renders as itself rather than being hidden — the same fail-visible rule
`accountTypeLabel` applies to account types. The back end's own status value
object already fails closed; the front end failing visible is the display-side
complement.

### Routing and serving need no change

`trailingSlash` is already on, so the export writes `out/accounts/index.html`
and the existing nginx `try_files` rule serves `/accounts/` with no
configuration change. The nav section, the ability gate, and the wildcard
ability that satisfies it are already in place from spec 0001's shell work.

## Testing Decisions

**No new back-end tests.** Nothing on the back end changes, and
`SuperAdministerAccountsTest` already asserts the directory's contents, its
ordering, the inclusion of suspended and pending accounts, the caller's own
presence, and the refusals for every other account type. Adding tests there
would restate what is already asserted.

**The API client is tested over a real client with a fake network**, like the
existing operations tests: `listAccounts` issues a GET to
`/api/v1/identity/accounts` carrying the bearer token, the response is
validated through the real schema, and failures surface as the normalised
`ApiError`.

**The session binding is tested per application.** `operationsFor` built for
the super-admin application exposes a callable `listAccounts` that issues the
request; built for the user application, the name is absent — the compile-time
narrowing is backed by a runtime assertion so the property is demonstrable, not
assumed.

**The page is tested as markup.** A new `accounts-page` test renders
`AccountsScreen` with `renderToStaticMarkup`: rows with type labels and
statuses in words; the loading state announced via `role="status"`; the empty
state on an empty directory; the error state with its retry affordance; and
filters that narrow the rows. It cannot click and does not pretend to; the
clicking is trivial and the wiring is the part worth proving.

**The repo-wide gates stay green and are the integration test.**
`FrontEndApplicationsTest` (no `fetch`, no forms, no shell, no banned operation
names in application source), the per-application static-export test, the
contract drift check, and a workspace-wide typecheck and test run.

## Out of Scope

- **Suspend and promote.** The two mutations this surface exists for are
  deliberately sequenced after the directory; see spec 0003. The backend, the
  contract and the client definitions already exist for them — spec 0003 is
  presentation and interaction, not infrastructure.
- **The `/admins/` and `/audit/` sections.** They remain links to 404s until
  their own work lands; this spec does not fill them.
- **Dashboard data.** The welcome dashboard's real data arrives with its own
  ticket and is untouched here.
- **Creating, editing or deleting accounts.** No delete route exists on this
  surface by design — suspension replaces deletion, and account creation
  depends on the undecided domain. Neither is invented here.
- **Suspend and promote for users and workers.** No contract exists for them
  yet; inventing one is not this spec's job.
- **Server-side pagination, sorting and searching.** Revisit when the
  unpaginated response becomes noticeable in network or render cost — a
  contract change to the same route name, made once, deliberately.
- **Any change to the response shape.** Including splitting the front end's
  single `AccountSummary` into four; that happens the day the back end's four
  summary types diverge.

## Further Notes

**Sequencing is the point of splitting 0002 from 0003.** The directory proves
the table, the states, the filters and the per-application binding before any
action hangs off a row. An operator who can read the directory today and act on
it tomorrow is better served than one waiting for both.

**The operations-map change is the only shared-code change**, and it is
additive. The other three applications' bundles gain nothing: their entries in
`OPERATIONS_BY_APPLICATION` are unchanged, and the narrowing means the extra
name is not in their type surface.

**The contract, the OpenAPI document and the back end are already in
agreement**, so `api-client:check` and the OpenAPI check pass unchanged. A
spec whose implementation requires no contract change is worth stating
explicitly, because the contract checks are the repo's mechanism for catching
the drift this spec could otherwise introduce.
