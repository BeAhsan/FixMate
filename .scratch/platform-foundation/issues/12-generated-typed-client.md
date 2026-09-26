# 12: Generate the typed client the front ends call

**What to build:** The front ends stop hand-writing URLs. Typed functions are
generated from the back end's actual routes into one shared package that all four
applications import, produced fresh by the build so it can never be stale. If a
route is renamed, the build fails rather than a user's browser. The generated
output is not committed. This is the contract between the two sides, and the one
new test seam the whole platform depends on.

**Blocked by:** 03 (sign in as an end user)

**Status:** ready-for-agent

- [ ] Typed request functions are generated from the back end's routes
- [ ] Route parameters are typed, so an endpoint cannot be called with the wrong identifier type
- [ ] The generated output lands in one shared package that all four applications import
- [ ] Generation runs as an explicit build step, because the back end no longer has a front-end build to hang it on
- [ ] The build regenerates the client and fails when the result differs from what the front ends expect
- [ ] Responses are validated against a declared shape on arrival, so a back-end change surfaces as a clear error
- [ ] Every error response is normalised to one shape, so four applications handle failure identically
- [ ] The access token is attached by the shared client rather than by each application
- [ ] The generation step is the only place that knows the tool's interface, so a change in it is a fix in one place
