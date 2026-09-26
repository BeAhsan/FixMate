# 05: Throttle repeated sign-in failures with per-account-type buckets

**What to build:** Four unguarded sign-in endpoints is a brute-force amplifier.
Repeated failures against one endpoint eventually produce a throttle response
rather than an ordinary rejection, and the person is told plainly how long they
must wait. **The four endpoints are throttled independently** — exhausting the
worker sign-in must not lock the same address out of the customer sign-in, or one
attacker could lock out every account type at once.

**Implementation note (superseded).** This ticket originally specified
`GuardAwareLoginRateLimiter`, a subclass of Fortify's limiter that prefixed the
throttle key with the guard name. Fortify has since been removed — see the
Authentication section of the spec — and the separation is now achieved by the
limiter *name*, since Laravel stores the counter under it. Four names are four
independent counters. That is worth stating because the obvious implementation,
one limiter keyed on address and IP, is wrong here and looks correct.

**Blocked by:** 03 (sign in as an end user)

**Status:** ready-for-agent

- [x] Repeated failed attempts eventually produce a throttle response distinct from an ordinary rejection
- [x] The throttle response tells the person how long they must wait before trying again
- [x] The wait stated in the body and the `Retry-After` header agree, so the message cannot be a lie the person acts on
- [x] The throttle response carries no stack trace, file path, or line number, so the response shape does not change between debug and production
- [x] A successful sign-in by a different person is not affected by another person's failures
- [x] The four endpoints are throttled independently — exhausting one does not lock the same address out of another
- [x] Case variation on the address does not buy a fresh allowance
- [x] Every account type has a limiter registered, so a sign-in route added later cannot reference one that does not exist
- [x] The attempt limit and the decay window are configuration, not constants buried in code
- [x] The behaviour is asserted through HTTP
