# 01: Make the back end a pure API

**What to build:** The Laravel back end stops serving HTML entirely. There is no
Blade, no Vite asset pipeline, no example view, and no route that renders a page.
The only thing it serves is JSON, plus the health endpoint the deploy script
already depends on. This is deliberate groundwork: every later ticket assumes the
back end has no front end attached, and nothing after this one should have to
think about Blade again.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The example view, its route, and the CSS/JavaScript entry points are removed
- [ ] The container image no longer builds front-end assets, and the build stage that did so is gone
- [ ] The health endpoint still responds, unchanged, because the deploy script polls it
- [ ] The API is reachable and returns JSON rather than HTML
- [ ] The existing example feature test that asserted a page renders is replaced by one that asserts the API surface
- [ ] The full test suite passes and the formatting check passes
- [ ] A container image builds and runs from this change alone
