# 18: Ship the other three applications

**What to build:** The worker, administrator, and super administrator
applications, each with its own address, its own sign-in process against its own
account type, and its own dashboard, all built from the pattern already proven.
None of them contains a copy of the sign-in flow or the shell — if one does, the
monorepo has failed and that is the thing to fix. After this, all four exist and
each is independently deployable.

**Blocked by:** 16 (shared session layer), 17 (shared interface and shell)

**Status:** ready-for-agent

- [ ] Three further applications exist, each with its own address
- [ ] Each signs in only against its own account type, and refuses the other three
- [ ] Each has its own dashboard, and each is its own deployable image
- [ ] Each type-checks and builds from a clean checkout
- [ ] The four applications import the same generated client, session layer, and interface packages
- [ ] None of the four contains a copy of the sign-in flow or the shell
- [ ] Deploying one application does not require rebuilding the other three
