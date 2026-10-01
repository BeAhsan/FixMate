import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
    CustomerSignIn,
    MOCKED_FEATURES,
    SUPPORTED_CLAIM,
    UNSUPPORTED_CLAIMS,
} from '../src/react/customer-sign-in'

/**
 * The designed sign-in screen, checked for what it must and must not claim.
 *
 * This screen is mostly a mock — the back end has no OTP route, no social
 * sign-in and no registration — and a mock is exactly where a screen starts
 * claiming things it cannot do. So the tests here are about **honesty and
 * accessibility**, not appearance: that the one real flow is the real one, that
 * the three mocked ones say so, and that the two claims this code cannot
 * substantiate are named in one place rather than written into the markup where
 * nobody would find them again.
 *
 * `renderToStaticMarkup` cannot click, so the interactive behaviour is not
 * tested here. The static contract is: what is in the document, what has a
 * label, and what is announced.
 */

const noop = async () => {}

function render(overrides: Partial<Parameters<typeof CustomerSignIn>[0]> = {}): string {
    return renderToStaticMarkup(
        <CustomerSignIn
            onSignIn={noop}
            failure={null}
            pending={false}
            notice={null}
            title="Customer Sign In"
            {...overrides}
        />,
    )
}

describe('the designed sign-in screen', () => {
    it('names itself in the header and greets in the panel', () => {
        const html = render()

        expect(html).toContain('Customer Sign In')
        expect(html).toContain('Welcome Back')
        // The design's own line, so a paraphrase cannot pass as a match.
        expect(html).toContain('Sign in to book a trusted professional')
    })

    it('leads with the one-time password, as the design does', () => {
        const html = render()

        expect(html).toContain('Get One-Time Password (OTP)')
        expect(html).toContain('Mobile Number')
        // Email is behind the toggle, so it must not also be a visible form.
        expect(html).not.toMatch(/autocomplete="current-password"/i)
    })

    it('tells the person holding the phone that the OTP is not connected', () => {
        // The design's own sentence promises a code "via instant SMS &
        // WhatsApp", and the button above reveals a field for a code that is
        // never going to arrive. That is the worst of both — a promise made and
        // then silently not kept — so the screen says so on the screen, not only
        // in a comment.
        const html = render()

        expect(html).toContain(MOCKED_FEATURES.otp)
        // The design's sentence stays, as the intent it is.
        expect(html).toContain('4-digit verification code')
    })

    it('relates the email toggle to the form it opens', () => {
        // A control that opens something without saying so is a control whose
        // effect a screen-reader user has to discover by activating it.
        const html = render()

        expect(html).toContain('aria-expanded="false"')
        expect(html).toContain('aria-controls="customer-sign-in-email"')
    })

    it('labels the phone field and tells a password manager what it is', () => {
        const html = render()

        // `tel` + `tel-national` is what offers a saved number. A `text` input
        // with a "Mobile Number" label is the version that gets retyped.
        expect(html).toMatch(/<label[^>]*>Mobile Number<\/label>/)
        expect(html).toContain('type="tel"')
        // Case-insensitive on the attribute name, for the same reason the
        // sign-in screen's own test is: a browser's DOM lowercases it, but
        // `renderToStaticMarkup` emits React's `autoComplete` verbatim, and the
        // first version of this assertion used the lowercase form and failed on a
        // correct render.
        expect(html).toMatch(/autocomplete="tel-national"/i)
    })

    it('keeps the privacy notice, which the design does not have room for', () => {
        // The design carries a trust badge and a register link where a privacy
        // notice would go. The notice is not optional: it is the only place this
        // screen says what happens to the credentials it is about to send.
        const html = render()

        expect(html).toContain('aria-labelledby="privacy-notice-heading"')
        expect(html).toContain('What happens when you sign in')
    })

    it('asks for the typeface from a variable', () => {
        // The other three applications never load `--font-jakarta`.
        expect(render()).toContain('var(--font-jakarta')
    })

    it('names every mocked feature in one place rather than in the markup', () => {
        // The point of this test: someone reading the file learns what is real
        // without auditing handlers. If a mock is added without being named here,
        // this fails.
        expect(Object.keys(MOCKED_FEATURES)).toEqual(['otp', 'providers', 'register'])
        for (const reason of Object.values(MOCKED_FEATURES)) {
            expect(reason.length).toBeGreaterThan(10)
        }
    })

    it('refuses a provider sign-in rather than pretending one happened', () => {
        // The alternative — a button that reports success — is a lie told to
        // somebody who is trying to get into their account. The refusal text is
        // the mock's own, so it cannot drift from the reason recorded above.
        expect(MOCKED_FEATURES.providers).toBe(
            'Google and Apple sign-in have no back-end route yet.',
        )
    })

    it('does not link registration to a route that does not exist', () => {
        // A link to nowhere is a 404 with no explanation. Asserted as the
        // *absence* of an anchor, because "is it a span" is the property.
        expect(render()).not.toMatch(/<a[^>]*>\s*Register Now/)
        expect(render()).toContain('Register Now')
    })
})

describe('the trust badge', () => {
    it('states the one claim this code can support', () => {
        // True and checkable: the transport is TLS, and the password is never
        // stored by this page.
        expect(SUPPORTED_CLAIM).toBe('256-bit Encrypted')
        expect(render()).toContain(SUPPORTED_CLAIM)
    })

    it('records the two claims it cannot, and renders neither', () => {
        // The privacy notice in this repository is held to a stricter rule: a
        // claim that cannot be substantiated is worse than no claim. The design
        // specified both of these and there is no verification feature and no
        // anti-spam system here to substantiate them, so they are **not on the
        // screen**. The list is kept as the record of a decision somebody will
        // ask about, and this is the assertion that stops it drifting back in.
        expect([...UNSUPPORTED_CLAIMS]).toEqual([
            'Verified Mistri Checks',
            'Zero Spam Guarantee',
        ])

        const html = render()
        for (const claim of UNSUPPORTED_CLAIMS) {
            expect(html).not.toContain(claim)
        }
    })
})

describe('the customer voice', () => {
    /**
     * The design was drawn for a page serving both kinds of account, and its copy
     * belongs to neither on its own. "Mistri" is what the *worker* is called, so
     * using it to describe the person standing at this screen tells them
     * something they did not ask about and cannot act on.
     *
     * Asserted on the rendered string rather than on the source, because the
     * failure mode is a word surviving in one `aria-label` nobody re-reads.
     */
    it('never calls the customer a mistri', () => {
        expect(render()).not.toMatch(/mistri/i)
    })

    it('offers no way to become the other kind of account', () => {
        // The design's role switcher. This screen is one door, so asking somebody
        // to pick the door they are already at is noise, and the second option
        // was a link out of an application built so a front end cannot cross into
        // another account type. Its absence is the design decision.
        const html = render()

        expect(html).not.toContain('I&rsquo;m a Customer')
        expect(html).not.toMatch(/I&rsquo;m a Mistri/i)
        // No link anywhere leaves this door.
        expect(html).not.toMatch(/localhost:3001/)
    })
})

describe('the email toggle', () => {
    it('is a button, and names the form it will show', () => {
        // Naming the *other* form, not the current one: the label says what
        // pressing it does, which is the only useful reading of a toggle.
        const html = render()

        expect(html).toContain('Login with Email &amp; Password')
        expect(html).toMatch(/<button[^>]*type="button"/)
    })

    it('puts both halves of the form inside the panel, in the design order', () => {
        // The design's order is OTP card, divider, email row, providers. An
        // earlier version put the divider above the providers and left the email
        // form outside the panel entirely, which is a different screen.
        const html = render()

        const otpAt = html.indexOf('Get One-Time Password (OTP)')
        const dividerAt = html.indexOf('or continue with')
        const toggleAt = html.indexOf('Login with Email &amp; Password')
        const googleAt = html.indexOf('Google')

        expect(otpAt).toBeLessThan(dividerAt)
        expect(dividerAt).toBeLessThan(toggleAt)
        expect(toggleAt).toBeLessThan(googleAt)
    })

    it('keeps the OTP card and the toggle on screen together', () => {
        // The state a first visit gets: the OTP card is showing, and the control
        // that reveals the other one is still in the document. If the two were
        // swapped — the card out while its toggle went with it — there would be
        // nothing on the page saying another way in exists.
        //
        // Named for what it checks. The *other* state, with the email form open,
        // needs a click and so belongs in a mounted test; `renderToStaticMarkup`
        // cannot reach it, and a test that claims to is worse than no test.
        const html = render()

        expect(html).toContain('Get One-Time Password (OTP)')
        expect(html).toContain('Login with Email &amp; Password')
    })
})
