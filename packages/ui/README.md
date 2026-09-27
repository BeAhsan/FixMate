# packages/ui

The design system, the application shell, and the form and feedback primitives
the four dashboards share. One implementation, so moving between the four
applications does not mean relearning the interface.

## It knows nothing about sessions

The shell takes `identity`, `abilities`, `sections` and an `onSignOut` callback
as props. It imports nothing from `@fixmate/session` and holds no session state.

That is the load-bearing decision. It keeps the design system free of any opinion
about authentication, which means the components are testable without a session
and the session layer is free of any opinion about headers. Each application wires
the two together in one small file — `apps/user/app/dashboard-shell.tsx` — and
moving to the worker application is a copy of that file with three values changed.

The account type in the header is the **back end's** answer, read from `me`, not
the application's own configuration. A shell that labelled itself would be
labelling itself on trust.

## The accessibility decisions, and why each is here

These are asserted as behaviour in `test/components.test.tsx` rather than left as
comments, because every one of them is invisible in a screenshot — which is
exactly why they rot in a design system.

- **A skip link, first in the DOM.** The navigation is the first thing in the
  document and a keyboard user crosses it on every page.
- **`aria-label` on the `<nav>`.** Four shells can be on screen at once in a split
  view; an unlabelled navigation is announced only as "navigation".
- **`aria-current="page"` on the active link.** The only thing that tells a
  screen reader where they are. Styling the current page is not a substitute —
  colour alone says nothing to anyone who cannot see it.
- **Labels tied to inputs by generated ids.** A placeholder is not a label: it
  disappears on the first keystroke and is not reliably announced.
- **`role="alert"` for errors, `role="status"` for everything else.** A refused
  sign-in is the one thing on screen that matters at that moment and should
  interrupt; a loading message that interrupts is worse than no message.
- **No `outline: none`, anywhere.** Stated in `globals.css` as well as on the
  components, so a component added later inherits it without having to remember.
- **Tab order follows visual order.** The sign-out button is in the header row
  above the navigation, so it is reached before it. The test asserts the whole
  sequence rather than "the button is focusable", because a shell that skipped
  the navigation passes the weaker test.

## Layout

One column that reflows, `rem` throughout, `flex-wrap` on the navigation rather
than horizontal scrolling. A navigation you have to scroll sideways hides its own
items from a phone, and `rem` is what makes a browser's font-size setting enlarge
the whole interface together instead of clipping it.

Verified rather than assumed: Lighthouse accessibility **1.0** on both the sign-in
screen and the shell, no horizontal overflow at a 200% root font size, and a
correct `viewport` meta so a phone does not simply zoom out.

## Navigation is filtered, and that is not the protection

A section whose `requiredAbility` the live token does not carry is not rendered.
The back end refuses it either way — hiding navigation is a courtesy, not the
control — and `EnsureAccountCan` is the control. The two are not the same thing
and only one of them is load-bearing.

If the abilities cannot be read, they stay **empty**, which hides every
ability-scoped section. Failing closed is the whole point: a section missing for a
moment beats a dead link somebody clicks.

## Commands

```sh
npm run typecheck --workspace=@fixmate/ui
npm test --workspace=@fixmate/ui
```

Component tests use **jsdom**, not happy-dom, because the accessibility queries in
`@testing-library` rely on the accessibility tree and a partial implementation
answers "is this a link?" wrongly often enough that a green suite would mean
nothing.

`afterEach(cleanup)` is explicit and load-bearing. Testing Library registers it
automatically only when vitest's `globals` are enabled, and this package turns
them off so a test cannot quietly depend on a global its author never imported.
Without the call, renders accumulate and `getByRole` fails with "found multiple
elements" — which reads like a component bug and is not one.
