# 14: Ship the first application as a static export in a container

**What to build:** One application — the end user's — builds to a static export
and is served as its own immutable container image, with no source on disk and no
long-running process. This is the front-end tracer bullet for packaging: it
proves a static export survives the trip through a container, so the other three
are copies of something demonstrated rather than invention. It does not talk to
the back end yet.

**Blocked by:** 13 (monorepo skeleton)

**Status:** ready-for-agent

- [ ] The end user application builds to a static export with no application server
- [ ] The export is served by its own container image
- [ ] No source is present in the image; only the built output
- [ ] Serving a page needs no long-running process beyond the web server
- [ ] The image adds no runtime that the server does not already have
- [ ] The application type-checks and builds from a clean checkout
- [ ] The export is reachable and renders, verified by fetching it from the running image
