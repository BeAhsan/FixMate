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

/**
 * The floating treatment, and the boundary it must not cross.
 *
 * A variant is a *style* switch, so the property worth testing is not how it
 * looks but what it is unable to change. Every test below is about the treatment
 * leaving the form alone: the same fields, the same labels, the same password
 * manager hints, the same refusal, the same notice. A restyle that quietly
 * dropped `autocomplete` or moved the privacy notice would look finished and
 * would break a password manager and a privacy claim at the same time.
 */
describe('the sign-in screen, on the floating surface', () => {
    const onSurface = (overrides: Partial<Parameters<typeof SignInForm>[0]> = {}) =>
        render({ surface: 'apple', ...overrides })

    it('is a wrapper, not a different form', () => {
        const html = onSurface()

        // The accessible skeleton is identical to the plain screen's, because it
        // is the same component with a different set of classes.
        expect(html).toMatch(/<label[^>]*>Email address<\/label>/)
        expect(html).toMatch(/<label[^>]*>Password<\/label>/)
        expect(html).toMatch(/autocomplete="username"/i)
        expect(html).toMatch(/autocomplete="current-password"/i)
        expect(html).toContain('Show password')
        expect(html).toContain('type="password"')
    })

    it('keeps the refusal assertive, and the notice after the form', () => {
        // The two things that are easy to lose in a visual rewrite, and both
        // were load-bearing: a polite refusal would let somebody finish typing
        // before it was read, and a notice above the form competes with the thing
        // they came to do.
        const refused = onSurface({ failure: { kind: 'refused', message: 'Those details are not right.' } })

        expect(refused).toContain('role="alert"')
        expect(refused).toContain('Those details are not right.')
        expect(onSurface()).toContain('aria-labelledby="privacy-notice-heading"')

        const formAt = refused.indexOf('<form')
        const alertAt = refused.indexOf('role="alert"')
        expect(formAt).toBeGreaterThan(-1)
        expect(alertAt).toBeGreaterThan(formAt)
    })

    it('still disables the button while the request is in flight', () => {
        expect(onSurface({ pending: true })).toContain('disabled')
        expect(onSurface({ pending: true })).toContain('Signing in')
    })

    it('applies the material treatment, and only in this variant', () => {
        // `backdrop-blur` is the whole point of the surface, and it is what makes
        // it translucency rather than a tinted rectangle. Asserted here because a
        // restyle that dropped it would still render and still look deliberate.
        expect(onSurface()).toContain('backdrop-blur-2xl')

        // And the plain screen must not have gained it: the other three
        // applications never asked for this treatment.
        expect(render()).not.toContain('backdrop-blur-2xl')
    })

    it('answers the accessibility preferences rather than ignoring them', () => {
        const html = onSurface()

        // Reduced transparency goes near-opaque, not to "no background": a panel
        // with nothing behind it is *less* legible, not more.
        expect(html).toContain('prefers-reduced-transparency')
        expect(html).toContain('prefers-contrast')

        // Reduced motion drops the movement and keeps the feedback, so a press
        // still answers.
        expect(html).toContain('motion-reduce')
    })

    it('asks the typeface from a variable, so an application without it is unaffected', () => {
        // The other three applications never load `--font-jakarta`. A bare family
        // name would render in a fallback nobody chose; the variable with a
        // system-ui fallback behind it is what makes this shared.
        expect(onSurface()).toContain('var(--font-jakarta')
    })

    it('keeps the reveal control after the input, in either variant', () => {
        // Tab order follows DOM order, and an eye icon before the field would be
        // reached before the password — so a keyboard user would toggle the
        // reveal before ever reaching the field. Asserted on both variants because
        // a restyle is exactly when this would be tidied "into" the input.
        for (const html of [render(), onSurface()]) {
            expect(html.indexOf('type="password"')).toBeLessThan(html.indexOf('Show password'))
        }
    })

    it('keeps the reveal control from submitting the form', () => {
        // `type="button"`, asserted as the attribute rather than through a click:
        // jsdom does not implement submission from a button, so a behavioural
        // test passes with the attribute deleted. A submit-typed reveal would
        // sign the person in with a half-typed password.
        expect(onSurface()).toMatch(/type="button"[^>]*>Show password/)
    })

    it('keeps the mark out of the accessibility tree', () => {
        // Decorative. Announced, it would read the logo out as content before the
        // heading says anything.
        expect(onSurface()).toContain('aria-hidden="true"')
    })
})
