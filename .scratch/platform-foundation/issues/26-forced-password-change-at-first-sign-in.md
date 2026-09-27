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

## The provisioning question is answered; the rest is not

`fixmate:create-account` now exists and closes the urgent half. It creates one
account of any of the four types with a generated password, printed once and never
logged. **The flag still does not**, and that is deliberate rather than an
oversight: adding a `must_change_password` column here would make every record
created by the command look protected while nothing enforced it, because the guard
below is the part that makes the flag mean anything. The column and the guard land
together, in this ticket.

What provisioning gives story 21 in the meantime: the new owner is handed a random
password they did not choose, and the reset flow that already exists lets them
replace it immediately. So the *outcome* is reachable today; what is missing is
that the system insists on it rather than making it the obvious next step.

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

## The decision this was blocked on — answered

**Who sets `must_change_password`?** Nobody yet, and that is now a choice rather
than an oversight.

- **`fixmate:create-account` shipped**, and it deliberately does **not** set the
  flag. It closes the gap that mattered — a fresh install can now produce its
  first administrator — and a flag it set with nothing enforcing it would be
  worse than no flag, because it reads as protection on the record of every
  account the command creates.
- **The column and the guard land here, together**, in this ticket. The
  provisioning command then sets the flag, and the two become one change.
- The seeder is not used as the producer. A production account created by a
  seeder is a fixture with a real address in it, and that is a habit worth not
  forming while the alternative is a command that already exists.

The provisioning command is
`php artisan fixmate:create-account <type> --name= --email= [--password=]`.
