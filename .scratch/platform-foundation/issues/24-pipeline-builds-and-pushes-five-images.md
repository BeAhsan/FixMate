# 24: Build and push all five images from one commit

**Run by:** you, not an agent. This is the first ticket where the whole set ships
together, so run it only after 21 to 23 are rehearsed and working.

**What to build:** The existing pipeline is extended, not replaced: the same
registry, the same controller, the same credentials, the same release history. It
builds five images from one commit — the back end from the existing Dockerfile
with its asset stage removed, and four front ends as static exports — and pushes
all five. The build stays single-architecture, matching the existing pipeline
parameter, because the platform must match the target processor and getting it
wrong succeeds at build time and fails at run time.

**Blocked by:** 18 (the other three applications), 23 (record and roll back all five versions together)

**Status:** ready-for-human

- [ ] Five images build from one commit and push under the existing registry and owner
- [ ] The registry name is changed in all three places it appears, not just one
- [ ] The build stays single-architecture and matches the existing pipeline parameter
- [ ] The existing stages, controller, credentials, and release history are kept
- [ ] The pull-request gate runs the same checks as the pipeline
- [ ] A full deploy from a clean run of the pipeline lands all five and health-checks them
- [ ] A deliberate contract break fails the build rather than shipping
