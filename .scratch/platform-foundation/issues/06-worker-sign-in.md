# 06: Sign in as a worker

**What to build:** The proven sign-in path is repeated for the second account
type. A worker signs in at the worker application's address and is checked only
against the workers table. This is the first proof that the pattern from the end
user's sign-in generalises rather than having been built to fit one case, and
that a worker's commercial attributes live on the worker record rather than on a
customer's.

**Fortify pattern (from research):** `WorkerLoginController` constructed with
`Auth::guard('workers')` and `GuardAwareLoginRateLimiter` bound as
`fortify.limiter.workers` — same DI pattern as the user controller, different
guard.

**Blocked by:** 03 (sign in as an end user)

**Status:** ready-for-agent

- [ ] A worker signs in at the worker application's own address
- [ ] Credentials are resolved against the workers table only, never the users table
- [ ] A worker's own attributes are carried on the worker record, not on a customer record
- [ ] The issued token carries the worker's abilities, which differ from a customer's
- [ ] The same layering is used as the end user path, with no second implementation to maintain
- [ ] The path is covered by a feature test asserting observable behaviour from outside
