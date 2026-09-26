# 23: Record and roll back all five versions together

**Run by:** you, not an agent. Rollback is the safety net; verify it actually
restores a working state before you rely on it, by rolling back on purpose once.

**What to build:** The release record becomes the set of five versions rather
than one, so an operator can answer what is running right now across the whole
platform. Rollback restores the previous front-end versions as well as the
previous back end, which is the point: a back end that rolled back alone would be
served by front ends built against a contract it no longer has, and nobody could
sign in.

**Blocked by:** 22 (deploy script becomes a set deploy)

**Status:** ready-for-human

- [ ] The recorded release holds all five component versions, not one
- [ ] There is a way to see which five versions are live right now
- [ ] Rollback restores the previous front end versions as well as the previous back end
- [ ] Rolling back never reverts a database migration
- [ ] A release history is appended to rather than overwritten
- [ ] Rollback is verified on purpose at least once, and the result confirmed as a working state
- [ ] The server's existing automated rollback keeps working after these changes
