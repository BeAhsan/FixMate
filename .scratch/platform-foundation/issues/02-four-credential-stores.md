# 02: Establish the four credential stores

**What to build:** The four account types exist as real, separate things: end
users, workers, administrators, and super administrators. Each has its own table,
its own authenticatable model, and its own guard. Signing in anywhere resolves a
credential against exactly one of them. This is the foundation every
authentication ticket builds on, and the reason a person who is both a customer
and a worker ends up with two genuinely independent accounts.

**Blocked by:** 01 (pure API back end)

**Status:** ready-for-agent

- [ ] Four account tables exist, each carrying name, email, password, status, and timestamps
- [ ] Email is unique within each table, but the same address may exist in more than one table
- [ ] Four guards are registered, each with its own provider and its own model
- [ ] No guard can resolve a credential held in another account type's table
- [ ] The one shared personal-access-token table supports all four account types as owners
- [ ] Password reset tokens are held per account type, so a reset can only ever resolve the type it was requested for
- [ ] Account status is suspendable without deleting the record
- [ ] The two-factor columns Fortify's installer would add are deliberately absent, because two-factor authentication is out of scope
- [ ] Each account type has a factory and tests run against an in-memory database with no external services
