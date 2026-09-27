# 26: Require a new password at first sign-in

**Status:** ready-for-agent, **blocked on one decision** — see the last section.
Renumbered because 11 was taken by the account-management ticket.

**Covers user story:** 21. "As a user signing in for the first time, I want to be
required to set a new password, so that a default or shared password is never in
use."

**This is not a screen.** It is the smallest complete slice that makes the story
true, and it is a migration, four routes, a guard, a use case and a change to the
sign-in contract. Story 18 and 22, which *are* screens, are done; this one is
recorded separately so the size is visible before anyone starts it.

## What has to exist

- [ ] A `must_change_password` flag on all four account tables, defaulting to false
- [ ] Sign-in reports the flag, so a front end can route to the change screen instead of the dashboard
- [ ] A `POST /{type}/password/change` route that takes the **current** password and a new one
- [ ] Changing the password clears the flag, and the account works normally afterwards
- [ ] **Every other authorised route refuses the account while the flag is set** — this is the part that makes the story true rather than advisory
- [ ] The new password is checked against `PasswordPolicy::rules()` before anything is written
- [ ] The current password is verified, so a stolen session token cannot set the password and lock the real owner out
- [ ] Both the access door and the renewal door are covered
- [ ] Covered by feature tests, including that the flag is cleared and that the
      same password cannot be re-chosen

## Two decisions in it, and why

**The guard is a middleware, and the flag in the sign-in response is only
advisory.** A front end that reads `must_change_password: true` and shows the change
screen is a courtesy; somebody with a token who calls `GET /users/me` directly must
be refused too, or the story is a suggestion. That is the same distinction ticket
10 drew between the ability and the account type, and it is why the flag alone is
not enough.

The guard goes on the guarded route group, not on individual routes, with the
change-password route exempted. A guard somebody has to remember to add to each new
route is a guard that will be missing from the next one.

**The change route requires the current password.** A `POST /password/change` that
took only a new password would let anyone holding a stolen access token set a new
one and lock the actual owner out permanently. Requiring the current password means
a stolen token cannot do this, which is the same reason the password is never
persisted anywhere in the front end.

**Reusing `PasswordPolicy::rules()`** rather than writing a second rule set. It is
already the single place the policy is expressed, and `ResetPasswordRequest` uses
it — a second copy is how the two drift and a password accepted at reset is
refused at change.

## What is deliberately not here

- **How an account comes into existence.** The spec puts registration and
  self-service sign-up out of scope, so nothing sets the flag on a real account
  yet. See the decision below.
- **Changing a password when the flag is *not* set.** A "change my password" screen
  for a signed-in person is a real feature and is not this story; this one is about
  the first sign-in. Same route, different entry point, and worth building later.
- **Any front end beyond routing to the change screen.** The four dashboards are
  shells by design, and the screen itself is a fifth screen in a shared shell.

## The decision this is blocked on

**Who sets `must_change_password`?**

Today the only things that create accounts are `DatabaseSeeder` — which creates one
test user with the factory password — and the model factories used by tests. There
is no provisioning flow, no invitation, and no staff-creation endpoint; ticket 25
manages accounts but does not create them, and creating a super administrator is
the first super administrator's own problem.

So the flag has no producer. Three ways forward, and the answer changes what gets
built:

1. **The seeder, for now.** The flag exists, the seeder sets it, the whole path is
   real and testable, and the producer is replaced when provisioning arrives. Smallest
   honest slice; nothing pretends accounts are provisioned.
2. **A provisioning command** — `php artisan fixmate:create-super-admin` and the
   same for the other three types, each creating an account with a random password
   and the flag set, printing the password once. This is what a real deployment
   needs *today*, because there is currently no way to create the first
   administrator of a fresh install at all, and it makes the flag's producer real.
   It is also a new surface that prints a secret to a terminal, which deserves its
   own care and its own ticket.
3. **Defer the whole ticket** until the domain decides how staff come into being.
   Defensible — but then story 21 stays uncovered, and the accounts that *do* exist
   (the seeder's, the factories') keep a shared password.

My recommendation is **1 plus a separate ticket for 2**. The flag, the route and the
guard are the same work either way, and 1 proves all of it. But if the answer is
that a fresh install currently has no way to create its first administrator, that
is a more urgent gap than this story, and it should be said out loud rather than
left implicit in a password flag.
