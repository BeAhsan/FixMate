# 20: Put the front ends behind the same gate as the back end

**What to build:** The four front ends get the same treatment the back end
already has. A pull request that breaks a front end's types, or that leaves the
generated client out of step with the back end's routes, fails before it can be
merged — and the delivery pipeline runs the same checks, so a change cannot pass
one and fail the other. This is the last ticket the agents run: everything after
it touches the live server.

**Blocked by:** 12 (generated typed client)

**Status:** ready-for-agent

- [ ] The pull-request gate type-checks and builds all four applications
- [ ] The pull-request gate regenerates the client and fails on a difference
- [ ] The delivery pipeline runs the same front-end checks as the pull-request gate
- [ ] The back end's formatting and test checks remain in both places
- [ ] Every check runs with no external services required
- [ ] A deliberately broken front end fails the gate, demonstrated rather than assumed
