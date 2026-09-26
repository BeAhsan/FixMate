# 05: Throttle repeated sign-in failures

**What to build:** Four unguarded sign-in endpoints is a brute-force amplifier.
Repeated failures against one endpoint eventually produce a throttle response
rather than an ordinary rejection, and the person is told plainly that they must
wait rather than being left to guess why they are being refused. Throttling here
is the cheapest meaningful defence, and it is why Fortify is in the design at all.

**Blocked by:** 03 (sign in as an end user)

**Status:** ready-for-agent

- [ ] Repeated failed attempts eventually produce a throttle response distinct from an ordinary rejection
- [ ] The throttle response tells the person they must wait before trying again
- [ ] A successful sign-in by a different person is not affected by another person's failures
- [ ] The throttle is keyed per account type, so it is scoped to the endpoint it was triggered on
- [ ] The attempt limit and the wait are configuration, not constants buried in code
- [ ] The behaviour is asserted through HTTP, because the throttle key includes the guard
