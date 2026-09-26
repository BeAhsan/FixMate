# 16: Keep people signed in safely

**What to build:** A session layer shared by all four applications. The access
token is held in memory only, never in browser storage, so injected script cannot
read it. Because an in-memory token does not survive a reload, a renewal token
restores the session on load, and it is rotated on every use and kept
short-lived. A person reloads a page and is still signed in, and returns to the
page they were on rather than starting over. This is a security decision, not a
convenience one, and it is the reason the access token is never written to
storage.

**Blocked by:** 15 (first application wired to the back end)

**Status:** ready-for-agent

- [ ] The access token is held in memory and never written to browser storage
- [ ] A renewal token restores the session on page load
- [ ] The renewal token is rotated on every use and expires if unused
- [ ] Signing out ends the session immediately, in this application and in the others
- [ ] When a session has ended, the sign-in screen explains why rather than appearing without warning
- [ ] Signing in from that redirect returns the person to the page they were on
- [ ] The signed-in and signed-out state is exposed to applications through one shared interface
- [ ] The renewal mechanism is isolated so it can later become an unreadable cookie without the applications changing
