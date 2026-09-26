# 05: Throttle repeated sign-in failures with guard-isolated buckets

**What to build:** Four unguarded sign-in endpoints is a brute-force amplifier.
Repeated failures against one endpoint eventually produce a throttle response
rather than an ordinary rejection, and the person is told plainly that they must
wait rather than being left to guess why they are being refused. **Crucially, the
four endpoints throttle independently** — exhausting the worker login must not
lock the same address out of the admin login. Fortify's default `LoginRateLimiter`
uses `email|ip` as the key with no guard, so a `GuardAwareLoginRateLimiter`
subclass prefixes the key with the guard name. This is the one place the
four-guard requirement changes the off-the-shelf behaviour.

**Blocked by:** 03 (sign in as an end user)

**Status:** ready-for-agent

- [ ] Repeated failed attempts eventually produce a throttle response distinct from an ordinary rejection
- [ ] The throttle response tells the person they must wait before trying again
- [ ] A successful sign-in by a different person is not affected by another person's failures
- [ ] **The throttle key includes the guard** (`users|email|ip`, `workers|email|ip`, etc.), so each endpoint throttles independently
- [ ] `GuardAwareLoginRateLimiter` is tested in isolation with different guards producing different keys for the same email/IP
- [ ] The attempt limit and the wait are configuration, not constants buried in code
- [ ] The behaviour is asserted through HTTP, because the throttle key includes the guard
