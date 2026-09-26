# 15: Wire the first application to the real back end

**What to build:** The end user application stops being a static page and starts
being a client of the back end. It calls the generated typed client, attaches a
token, and reaches a real sign-in endpoint on the running API, with the allowed
origins configured from one place naming the four application addresses. This is
the moment the front-end tracer bullet completes: a route in Laravel, a rendered
page in a browser, one command away.

**Blocked by:** 12 (generated typed client), 14 (first application as a static export)

**Status:** ready-for-agent

- [ ] The application calls the back end through the generated client rather than hand-written URLs
- [ ] A real sign-in request reaches the running API and succeeds for valid credentials
- [ ] The back end accepts the request, so the allowed-origins list names this application's address
- [ ] The allowed-origins list lives in one place naming all four application addresses
- [ ] The list is by origin rather than by pattern, so it works unchanged by port or by hostname
- [ ] A failed sign-in surfaces the back end's message rather than a blank screen
- [ ] A response failing its declared shape surfaces as a clear error
- [ ] The application still builds to a static export after the change
