# 03: Sign in as an end user, end to end

**What to build:** One complete sign-in path, through every layer, for one
account type. An end user submits credentials, the back end checks them against
the users table only, and issues a scoped access token. This is the tracer
bullet: the first time the layering, the guards, the Fortify integration, the API
resources, and the error envelope are all exercised together by something a
person could actually do. Every later back-end ticket copies a pattern proven
here, so this ticket stays deliberately thin — failure behaviour and throttling
are separate tickets.

**Blocked by:** 02 (four credential stores)

**Status:** ready-for-agent

- [ ] A sign-in endpoint accepts credentials and issues a token on success
- [ ] Credentials are resolved against exactly one account type's table
- [ ] The domain layer holds the rules and has no framework, database, or HTTP types in it
- [ ] The application layer exposes the use case the HTTP layer calls, taking and returning plain data
- [ ] Infrastructure is the only layer that knows the database framework exists
- [ ] The controller validates, calls one use case, and returns a resource
- [ ] The issued token carries only the abilities belonging to that account type
- [ ] The response shape is declared and asserted, so a later change to the table cannot silently alter it
- [ ] Domain rules are covered by pure unit tests with no database and no framework
- [ ] The happy path is covered by a feature test asserting observable behaviour from outside
