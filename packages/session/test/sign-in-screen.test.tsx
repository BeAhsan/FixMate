import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SignInForm } from '../src/react/application'

/**
 * The sign-in screen, checked as a whole rather than as its parts.
 *
 * `PasswordField` and `PrivacyNotice` are tested on their own in
 * `packages/ui`. This file answers a different question: are they actually *on
 * this screen*. A primitive that is built, exported, tested and never rendered is
 * a feature that does not exist, and no test in `packages/ui` could notice -
 * those tests render the primitive directly, so they pass whether or not
 * `SignInForm` uses it.
 *
 * Server-rendered rather than mounted in jsdom, and that is a constraint turned
 * into a choice. `packages/session` has no jsdom and no Testing Library, and
 * adding test dependencies to a workspace to prove a composition is a worse trade
 * than `renderToStaticMarkup`, which is already available through a dev
 * dependency the package has. `react-dom/server` can confirm what is in the tree
 * and what the attributes are; it cannot click, and it does not pretend to. The
 * clicking is tested where the component lives.
 *
 * `useId` is what ties the `<label>` to the input, and it works in a server
 * render, so the association is checkable here too.
 */

const noop = () => {}

function render(overrides: Partial<Parameters<typeof SignInForm>[0]> = {}): string {
    return renderToStaticMarkup(
        <SignInForm
            pending={false}
            failure={null}
            endedBecause={null}
            ready
            onSignIn={noop}
            {...overrides}
        />,
    )
}

describe('the sign-in screen', () => {
    it('offers a control to read back the password', () => {
        const html = render()

        // The reveal control, and a field that starts hidden. Both halves: a
        // control with nothing to reveal, or a reveal that starts on.
        expect(html).toContain('Show password')
        expect(html).toContain('type="password"')
    })

    it('labels the password field, so it can be found without the reveal control', () => {
        const html = render()

        // Both the email and the password must be labelled; a password field that
        // lost its label while gaining a button would be the trade this component
        // must not make.
        expect(html).toMatch(/<label[^>]*>Email address<\/label>/)
        expect(html).toMatch(/<label[^>]*>Password<\/label>/)
    })

    it('carries a privacy notice', () => {
        const html = render()

        expect(html).toContain('What happens when you sign in')
        expect(html).toContain('Your email address and password are sent')
        // As a landmark with a name, so it is reachable by region rather than by
        // reading the whole page.
        expect(html).toContain('aria-labelledby="privacy-notice-heading"')
    })

    it('tells a password manager the password is the current one', () => {
        const html = render()

        // Case-insensitive on the attribute name: a browser's DOM lowercases it,
        // but `renderToStaticMarkup` emits React's `autoComplete` verbatim, and the
        // first version of this test asserted the lowercase form and failed on a
        // correct render.
        expect(html).toMatch(/autocomplete="username"/i)
        expect(html).toMatch(/autocomplete="current-password"/i)
    })

    it('disables the button while the request is in flight, and says so', () => {
        // Story 16: a double tap on a slow connection must not send two sign-ins.
        const busy = render({ pending: true })

        expect(busy).toContain('disabled')
        expect(busy).toContain('Signing in')
        expect(render({ pending: false })).toContain('Sign in')
    })

    it('shows a refusal, and nothing at all before the restore has been tried', () => {
        // Story 13 and 14: told plainly, and never greeted with "your session has
        // ended" on a first visit.
        expect(render({ failure: { kind: 'refused', message: 'Those details are not right.' } })).toContain(
            'Those details are not right.',
        )
        expect(render({ ready: false })).not.toContain('Your session has ended')
    })

    it('says nothing about why after a deliberate sign-out', () => {
        // Story 11: somebody who pressed the button knows why they are here.
        expect(render({ endedBecause: 'signed-out', ready: true })).not.toContain(
            'Your session has ended',
        )
    })
})
