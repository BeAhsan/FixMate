# 13: Stand up the monorepo

**What to build:** The repository becomes a workspace monorepo holding four
applications and their shared packages. This ticket delivers no application — it
proves the workspace itself resolves, builds, and installs, so that every later
front-end ticket adds files to a structure already known to work. npm stays the
package manager, because the repository already has an npm lockfile and the
delivery pipeline already installs with it.

**Blocked by:** 12 (generated typed client)

**Status:** ready-for-agent

- [ ] The repository is a workspace monorepo with an applications directory and a packages directory
- [ ] npm remains the package manager, and the existing lockfile convention is preserved
- [ ] A shared package resolves and builds when imported from a workspace member
- [ ] Installing at the workspace root installs every member's dependencies
- [ ] The existing PHP application at the repository root is unaffected by the workspace
- [ ] The back end's container build context is not polluted by front-end build output
- [ ] A single documented command builds every workspace member from a clean checkout
