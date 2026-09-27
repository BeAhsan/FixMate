# 25: Manage accounts across the whole platform

**Run by:** an agent. This is ticket 11, which was written, never implemented,
and recorded as done. It is renumbered because 11 is taken.

**Why it is being done now:** the session that closed out tickets 01–20 recorded
all twenty as complete. Ticket 11 has no commit on the integration branch, no
use case, and no route. The only account-management surface that exists is
`GET /admins/{admin}`, and its own docblock says the rest — "listing, suspending,
promoting — is separate work". That separate work was never done, and nothing
noticed, because the ticket file was the only record of it and the file still
said the work was outstanding.

**What to build:** a super administrator can see every account in the system,
across all four account types, in one place with each one's status, and can
suspend an account or promote an administrator. Access is withdrawn by suspending
a record rather than deleting it, so the record of what that person did survives.
Two deliberate guard rails apply: an administrator cannot suspend their own
account, and the super administrator role is kept narrow.

**Blocked by:** 10 (ability-scoped authorisation) — already merged. The
`accounts:suspend` and `accounts:promote` abilities exist in the domain and have
no route using them, which is the clearest evidence that this ticket is missing
rather than merely undocumented.

**Covers user stories:** 39, 40, 41, 42.

- [ ] A super administrator can list every account across all four account types, with each one's status
- [ ] A super administrator can suspend an administrator account without deleting the record
- [ ] A suspended account is refused on both doors at once, so a change in access takes effect at once rather than at next sign-in
- [ ] A super administrator can promote an administrator, and promotion is warned about when the role is held by more than a couple of people
- [ ] An administrator cannot suspend their own account
- [ ] Each account type gets its own summary type, so one type's view cannot leak another's fields
- [ ] Suspending is recorded on the account rather than removing it
- [ ] Every action is covered by a feature test

## Two decisions this ticket makes on purpose

**Suspending does not revoke tokens.** The ticket asks for a suspended account to
be "signed out immediately", and it is worth being precise about what already
delivers that. `EnsureAccountCan` re-reads `$account->status` on *every*
authorised request, and `EnsureSessionCan` re-reads it on every renewal. So the
moment a status changes, both the access token and the renewal token stop
working — with no revocation anywhere, and no window in which a suspended person
keeps a session by never reloading. That is exactly the property the ticket is
after.

Revoking the tokens as well would be a second, redundant copy of a guarantee
that already lives in one place and is already tested. This repository's own
recorded position is that a duplicated control is a control that will drift, so
the ticket adds a *test* that both doors refuse a suspended account rather than a
third place that enforces it.

**Promoting moves a record rather than setting a flag.** Super administrators
live in their own table, so promotion creates a `super_admins` row and the
administrator row is left alone and suspended. That is what keeps the most
powerful account type a small countable set rather than a boolean on a table
anybody with `accounts:read` can reach.

## What the implementation revealed, and changed

**The self-suspension and self-promotion guards are unreachable over HTTP.** An
administrator is refused by the ability check and a super administrator by the
account-type check, so no request can reach either line. The rules are kept — they
are the thing that holds if either ability is ever widened — and the feature test
calls the two use cases **directly** to assert them. Claiming HTTP coverage would be
claiming a test that cannot fail. The HTTP-level tests assert what actually happens
there: an administrator token is refused at the door *even when it carries the
ability*, which is the half that is real today.

**Identifiers are only comparable within one account type.** A super administrator
and an administrator with the same number are two unrelated people, so both guards
compare the account type *before* the identifier. Comparing bare integers would
refuse a legitimate suspension about as often as it caught a real one, and it would
do so silently.

**Promotion needed a `create()`, not `save()`.** `save()` matches on identifier, and
identifiers are per table — so reusing the promoted administrator's identifier would
make promoting administrator 7 silently overwrite super administrator 7's name,
address, password and status. `SuperAdminRepository::create()` exists so the store
assigns the identifier, and the test asserts the new row's id is not the old one's.

**`PromotedAccountResource` cannot promote a constructor argument called
`$resource`.** `JsonResource` already declares a public `$resource`, so a promoted
`private readonly array $resource` is an access-level conflict and the class fatals
the first time a controller reaches it. The payload is held under its own name.

**`openapi.json` already had an `AccountSummary` schema, referenced by nothing**,
and it declared `additionalProperties: false` without the `type` field every row
carries. A schema no path references fails silently; this one only started
mattering when the directory started using it.

## Not fixed here, and it should be

**The front-end build is broken on macOS and this is pre-existing.** `npm run build
--workspaces` fails in all four applications with
`Cannot find module '../lightningcss.darwin-arm64.node'`, from
`node_modules/@tailwindcss/node/node_modules/lightningcss/node/index.js`.

It is **not** the `node_modules` trap `AGENTS.md` documents — that one was ruled
out by `rm -rf node_modules && npm ci`, after which the failure persisted. It is
Turbopack's module resolution, not Node's: plain `node -e "require(...)"` loads the
same binding successfully, and `next build --webpack` compiles all four
applications cleanly. Next is 16.3.6, where Turbopack is the default bundler.

Reproduced with this ticket's work stashed, so it is not caused by it. An npm
`overrides` entry pinning `lightningcss` to one version was tried and did not help —
npm keeps the nested copy — so that is not the fix either.

Two ways out, both needing a decision rather than a patch:

1. Add `--webpack` to the four applications' build scripts. No dependency change,
   costs Turbopack's speed.
2. Change something about the dependency graph or the Next version so Turbopack can
   resolve the nested binding. Keeps Turbopack, changes dependencies, and
   `AGENTS.md` says not to do that without approval.

Left unfixed and unhidden here rather than quietly worked around.


## What is deliberately not here

- Deleting an account. The ticket says access is withdrawn by suspending, and a
  record that can be deleted is a record whose history can be lost. There is no
  delete route and the guard rail above is phrased as "cannot suspend their own
  account" for that reason.
- Any front end. The super administrator dashboard is shell-only per the spec, and
  the account-management surface is API-only until that is revisited. Adding UI
  here would also mean a fifth screen in a shared shell that four applications
  share, which is a larger decision than this ticket.
- Auditing. Recording who suspended or promoted is a general audit trail, which
  the spec puts out of scope.
- Blocking the suspension of the last super administrator. It is a real hazard and
  a policy question, not an oversight: refusing it would mean nobody could ever be
  suspended by anybody, which is a lock-out of the whole platform. It belongs to
  whoever decides the policy.
