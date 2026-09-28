import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChangePasswordForm, destinationFor } from '../src/react/application'

/**
 * The change-password screen, checked as a whole rather than as its parts.
 *
 * `PasswordField` is tested on its own in `packages/ui`. This file answers the
 * different question `sign-in-screen.test.tsx` answers for the sign-in screen: are
 * the primitives actually *on this screen*. A primitive that is built, exported,
 * tested and never rendered is a feature that does not exist, and no test in
 * `packages/ui` could notice — those tests render the primitive directly.
 *
 * Server-rendered for the reason given in that file: this package has no jsdom,
 * and adding test dependencies to a workspace to prove a composition is a worse
 * trade than `renderToStaticMarkup`, which is already a dev dependency here. It
 * confirms what is in the tree and what the attributes are. It cannot click, and
 * it does not pretend to — the clicking is tested where the component lives.
 */

const noop = () => {}

function render(
    overrides: Partial<Parameters<typeof ChangePasswordForm>[0]> = {},
): string {
    return renderToStaticMarkup(
        <ChangePasswordForm
            pending={false}
            failure={null}
            ready
            onChangePassword={noop}
            onSignOut={noop}
            {...overrides}
        />,
    )
}

describe('the change-password screen', () => {
    it('asks for the current password and two copies of the new one', () => {
        const html = render()

        // The repeat is the field most likely to be left out, and it is the one that
        // decides whether somebody discovers a typo at this screen or at their next
        // sign-in. All three are named, because a password manager and a screen
        // reader both need to be able to tell them apart.
        expect(html).toMatch(/<label[^>]*>Current password<\/label>/)
        expect(html).toMatch(/<label[^>]*>New password<\/label>/)
        expect(html).toMatch(/<label[^>]*>Confirm new password<\/label>/)
        expect(html).toContain('name="current_password"')
        expect(html).toContain('name="password"')
        expect(html).toContain('name="password_confirmation"')
    })

    it('tells a password manager which of the three is the existing one', () => {
        const html = render()

        // `current-password` on the first field and `new-password` on the other two.
        // This is not cosmetic: a password manager told the whole form is creating a
        // new credential may offer to *generate* one, and will then fill the box
        // meant for the shared password this screen exists to replace with a guess.
        // Case-insensitive because a browser's DOM lowercases the attribute name.
        // Matched as one `<input>` rather than as two independent attributes, so a
        // field with the right `autocomplete` and the wrong `name` cannot pass: the
        // pairing is the whole claim. `autoComplete` is emitted first by
        // `renderToStaticMarkup` because that is the order the props are spread in.
        expect(html).toMatch(
            /<input[^>]*autocomplete="current-password"[^>]*name="current_password"/i,
        )
        expect(html).toMatch(/<input[^>]*autocomplete="new-password"[^>]*name="password"/i)
        expect(
            html.match(/autocomplete="new-password"/gi) ?? [],
            'both new-password fields must be marked as such',
        ).toHaveLength(2)
    })

    it('offers a way out without choosing a password', () => {
        const html = render()

        // A person on a shared device who is sent here is *most* entitled to leave
        // without choosing a password, and the back end exempts sign-out from its
        // guard for exactly that reason. A screen with no way off it is a trap, and
        // the only remedy the back end offers is the reset flow.
        expect(html).toMatch(/<button[^>]*>Sign out instead<\/button>/)
        // A `type="button"`, not a bare button: inside a form a button defaults to
        // submitting, so signing out would also try to change the password.
        expect(html).toMatch(/<button[^>]*type="button"[^>]*>Sign out instead<\/button>/)
    })

    it('puts the back end\'s refusal beside the field it belongs to', () => {
        // The back end keys a wrong current password on `current_password` and an
        // unchanged new one on `password`, precisely so the front end does not have
        // to map status codes to fields. A screen that showed one message for both
        // would throw that away and send somebody to re-type the right one.
        const html = render({
            failure: {
                message: 'The given data was invalid.',
                fields: { current_password: ['That is not your current password.'] },
            },
        })

        expect(html).toContain('That is not your current password.')
        // Announced, and wired to the input rather than floating beside it.
        expect(html).toContain('role="alert"')
        expect(html).toContain('aria-invalid="true"')
    })

    it('shows a message with no field of its own on its own', () => {
        // The network case: nothing failed about the password, so attaching the
        // message to an input would be a lie about which one.
        const html = render({
            failure: { message: 'Could not reach the FixMate service.' },
        })

        expect(html).toContain('Could not reach the FixMate service.')
        expect(html).not.toContain('aria-invalid="true"')
    })

    it('disables the button while the change is in flight, and says so', () => {
        // A double tap here would send two changes, and the second would be refused
        // as "the same password", which reads as a broken rule rather than a double
        // submission.
        const busy = render({ pending: true })

        expect(busy).toContain('disabled')
        expect(busy).toContain('Saving')
        expect(render({ pending: false })).toContain('Save and continue')
    })

    it('says the password was shared, which is the reason for the screen', () => {
        // The person has to be told why they are here. A form with no explanation is
        // one they will assume is a bug.
        const html = render()

        expect(html).toContain('Choose a new password')
        expect(html).toContain('shared with you')
    })
})

/**
 * Where a person is sent, which is the part of this flow no amount of rendering a
 * form can check.
 *
 * These are the decisions behind three redirects: after signing in, after
 * changing a password, and after arriving at the change screen with nothing to do.
 * They were one decision written twice and they drifted, which is how every
 * sign-in came to take two navigations instead of one — see the `next` cases below,
 * which are the regression.
 */
describe('where the change-password flow sends somebody', () => {
    const paths = { changePasswordPath: '/change-password/', homePath: '/' }

    const destination = (
        mustChangePassword: boolean,
        next: string | null = null,
    ) => destinationFor({ mustChangePassword, next, ...paths })

    it('sends a flagged account to the change screen, not to where it was going', () => {
        // The whole reason the screen exists. An account that must replace its
        // password is refused by every route except the change and sign-out, so
        // honouring `next` would land them on a dashboard whose every request fails
        // — the one outcome that tells them nothing about why.
        expect(destination(true, '/bookings/')).toBe(
            '/change-password/?next=%2Fbookings%2F',
        )
        expect(destination(true)).toBe('/change-password/')
    })

    it('carries the page they were going to, so the detour costs them nothing', () => {
        expect(destination(true, '/bookings/')).toContain('next=%2Fbookings%2F')
    })

    it('ignores a next that points back at the change screen', () => {
        // Not a hypothetical. The change screen used to bounce a signed-out person
        // to sign-in carrying exactly this, and following it on the way back
        // replaced the address with itself — one wasted navigation on every sign-in.
        // It is also reachable by typing the address, and a redirect that replaces
        // a location with itself will do so forever with nothing on screen to say
        // why.
        expect(destination(false, '/change-password/')).toBe('/')
    })

    it('follows any other next once the password has been chosen', () => {
        expect(destination(false, '/bookings/')).toBe('/bookings/')
    })

    it('goes home when there is nowhere to go back to', () => {
        expect(destination(false, null)).toBe('/')
    })
})
