# 19: Show real dashboard data, and say so when there is none

**What to build:** Each dashboard loads its own data from the back end and
presents it. Because the scope has no domain content yet, what matters is that
every state is handled deliberately: a visible loading state so a slow connection
does not look like an empty account, a clear empty state so absence is
intentional, and a failure state with a way to retry so a transient problem is
not a dead end.

**Blocked by:** 16 (shared session layer)

**Status:** ready-for-agent

- [ ] Each of the four dashboards loads its data through the generated client
- [ ] A visible loading state appears while data is fetched
- [ ] An empty state explains that there is nothing here yet
- [ ] A failure state explains the problem and offers a way to retry
- [ ] A response failing its declared shape surfaces as a clear error rather than a blank screen
- [ ] Data is scoped to the signed-in account type, so one account type cannot see another's records
- [ ] Each dashboard remains usable with no data present at all
