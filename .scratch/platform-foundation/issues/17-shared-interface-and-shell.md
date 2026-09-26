# 17: Build the shared interface and application shell

**What to build:** One design system and one application shell, shared by the
four dashboards, so moving between them does not mean relearning the interface.
The shell carries the header, navigation, and sign-out, shows which application
and account type is active, and offers only the navigation the signed-in account
type can actually reach. It is usable from a keyboard, readable at high zoom, and
usable on a phone.

**Blocked by:** 14 (first application as a static export)

**Status:** ready-for-agent

- [ ] The design system, shell, and form and feedback primitives live in one shared package
- [ ] The shell shows which application and which account type is signed in, so a shared device is not ambiguous
- [ ] Navigation shows only sections the account type can reach, rather than links that will refuse
- [ ] The whole shell is reachable and operable by keyboard alone
- [ ] The shell is usable on a phone with no horizontal scrolling
- [ ] The shell remains readable at high zoom without losing content
- [ ] The sign-in form is a separate address from the dashboard, not a modal over it
- [ ] The sign-in form is labelled for screen readers and announces its errors
- [ ] Shared components are covered by component tests
