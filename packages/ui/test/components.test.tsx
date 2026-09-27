import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    Alert,
    AppShell,
    accountTypeLabel,
    Button,
    Card,
    EmptyState,
    Field,
    canReach,
    fieldInputProps,
    knownAccountTypes,
    reachableSections,
} from '../src'
import type { ShellSection } from '../src'

/**
 * The shared components, tested for what a person actually gets.
 *
 * These assert accessibility as behaviour rather than as a comment: that a label
 * is associated with its input, that a refusal is announced, that the current
 * page is marked, and that the whole shell is reachable from the keyboard. Each
 * of those is invisible in a screenshot, which is why a design system is exactly
 * the place they rot.
 */

const sections: ShellSection[] = [
    { href: '/', label: 'Dashboard' },
    { href: '/bookings/', label: 'Bookings' },
    { href: '/accounts/', label: 'Accounts', requiredAbility: 'accounts:read' },
]

/**
 * Unmount between tests, explicitly.
 *
 * Testing Library registers this automatically only when vitest's `globals` are
 * enabled, and this package turns them off so that a test cannot quietly depend
 * on a global its author never imported. The consequence is that the cleanup has
 * to be asked for — and without it, renders accumulate and `getByRole` fails with
 * "found multiple elements", which reads like a component bug and is not one.
 */
afterEach(cleanup)

const identity = {
    application: 'user',
    applicationLabel: 'FixMate',
    accountType: 'Customer',
    accountName: 'Ada Lovelace',
    accountEmail: 'ada@example.test',
}

function renderShell(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
    return render(
        <AppShell
            identity={identity}
            sections={sections}
            abilities={['users:*']}
            onSignOut={vi.fn()}
            {...overrides}
        >
            <p>Dashboard content</p>
        </AppShell>,
    )
}

describe('the application shell', () => {
    it('names the application and the account type, in words', () => {
        // The shared-device question is "whose session is this?", and it is
        // answered in text on every screen rather than by an avatar.
        renderShell()

        const banner = screen.getByRole('banner')
        expect(within(banner).getByText('FixMate')).toBeDefined()
        expect(within(banner).getByText('Signed in as')).toBeDefined()
        expect(within(banner).getByText('Customer')).toBeDefined()
        expect(within(banner).getByText('Ada Lovelace')).toBeDefined()
    })

    it('shows a section needing no particular ability', () => {
        renderShell({ abilities: [] })

        expect(screen.getByRole('link', { name: 'Dashboard' })).toBeDefined()
    })

    it('hides a section the token cannot reach', () => {
        // A navigation that offers a link which will refuse is worse than one
        // that omits it. The back end refuses either way; this is the courtesy.
        renderShell({ abilities: ['users:*'] })

        expect(screen.queryByRole('link', { name: 'Accounts' })).toBeNull()
    })

    it('shows a section a super administrator can reach', () => {
        renderShell({ abilities: ['*'] })

        expect(screen.getByRole('link', { name: 'Accounts' })).toBeDefined()
    })

    it('marks the current page for a screen reader, not only with colour', () => {
        renderShell({ currentPath: '/bookings/' })

        expect(screen.getByRole('link', { name: 'Bookings' }).getAttribute('aria-current')).toBe('page')
        expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull()
    })

    it('labels the navigation, because four shells can be on screen at once', () => {
        renderShell()

        expect(screen.getByRole('navigation', { name: 'FixMate sections' })).toBeDefined()
    })

    it('offers a skip link that reaches the content', () => {
        renderShell()

        const skip = screen.getByRole('link', { name: 'Skip to content' })
        expect(skip.getAttribute('href')).toBe('#main')
        expect(document.querySelector('#main')).not.toBeNull()
    })

    it('can be tabbed through in visual order', async () => {
        const user = userEvent.setup()
        renderShell()

        // Tab order follows the visual order, which is what WCAG 2.4.3 asks
        // for: the sign-out button is in the header row above the navigation, so
        // it is reached before it. Asserting the whole sequence rather than
        // "the button is focusable" is the point — a shell where the navigation
        // is skipped over, or reached only by pointer, passes the weaker test.
        const order = ['Skip to content', 'Sign out', 'Dashboard', 'Bookings']

        for (const name of order) {
            await user.tab()
            expect(document.activeElement?.textContent).toBe(name)
        }
    })

    it('can be operated from the keyboard alone', async () => {
        // Reachability is not operability, and they fail separately. The button
        // is activated the way a keyboard user would — tabbed to from the top of
        // the document — rather than focused programmatically, and a separate
        // render from the ordering test so the starting focus position is the
        // same for both.
        const user = userEvent.setup()
        const onSignOut = vi.fn()
        renderShell({ onSignOut })

        await user.tab()
        await user.tab()
        expect(document.activeElement?.textContent).toBe('Sign out')

        await user.keyboard('{Enter}')
        expect(onSignOut).toHaveBeenCalledOnce()
    })

    it('keeps a visible focus indicator on everything focusable', () => {
        // The single most common regression in a design system, and invisible in
        // a screenshot. Asserted by the absence of an outline reset.
        const { container } = renderShell()

        expect(container.innerHTML).not.toMatch(/outline:\s*none/)
        expect(container.innerHTML).not.toMatch(/outline-none/)
    })

    it('marks itself busy while the session is still being restored', () => {
        renderShell({ ready: false })

        expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true')
    })

    it('is not busy once the session is known', () => {
        renderShell({ ready: true })

        expect(screen.getByRole('main').getAttribute('aria-busy')).toBeNull()
    })
})

describe('naming the account type', () => {
    it('shows a person a label, not the credential store’s name', () => {
        // "Signed in as super_admins" is the inside of the credential model on
        // screen. Found by looking at a real signed-in page, where the header
        // read "Signed in as users".
        renderShell({ identity: { ...identity, accountType: 'super_admins' } })

        const banner = screen.getByRole('banner')
        expect(within(banner).getByText('super administrator')).toBeDefined()
        expect(within(banner).queryByText('super_admins')).toBeNull()
    })

    it('labels all four account types the back end has', () => {
        // Kept in step with AccountType::label() on the back end. A fifth
        // account type added there without a label here passes through
        // unpolished, which is a bug somebody can report; a blank header is not.
        expect(accountTypeLabel('users')).toBe('end user')
        expect(accountTypeLabel('workers')).toBe('worker')
        expect(accountTypeLabel('admins')).toBe('administrator')
        expect(accountTypeLabel('super_admins')).toBe('super administrator')
        expect(knownAccountTypes()).toHaveLength(4)
    })

    it('passes an unknown account type through rather than blanking it', () => {
        expect(accountTypeLabel('some_future_type')).toBe('some_future_type')
    })
})

describe('deciding what a token can reach', () => {
    it('treats a missing requirement as reachable', () => {
        expect(canReach([], undefined)).toBe(true)
    })

    it('needs the exact ability otherwise', () => {
        expect(canReach(['users:*'], 'accounts:read')).toBe(false)
        expect(canReach(['accounts:read'], 'accounts:read')).toBe(true)
    })

    it('lets the wildcard reach anything', () => {
        expect(canReach(['*'], 'accounts:read')).toBe(true)
    })

    it('preserves the order it was given', () => {
        // The order is somebody's deliberate choice for their application, and
        // sorting it by label would quietly discard that.
        const reachable = reachableSections(sections, ['accounts:read'])

        expect(reachable.map((section) => section.label)).toEqual([
            'Dashboard',
            'Bookings',
            'Accounts',
        ])
    })
})

describe('a labelled field', () => {
    it('ties its label to the input', () => {
        render(
            <Field label="Email address">
                {(props) => <input {...fieldInputProps(props, { type: 'email' })} />}
            </Field>,
        )

        // getByLabelText throws if the association is missing, which is the
        // assertion: a placeholder is not a label.
        expect(screen.getByLabelText('Email address')).toBeDefined()
    })

    it('reads a hint after the label', () => {
        render(
            <Field label="Password" hint="At least twelve characters.">
                {(props) => <input {...fieldInputProps(props, { type: 'password' })} />}
            </Field>,
        )

        const input = screen.getByLabelText('Password')
        const describedBy = input.getAttribute('aria-describedby')

        expect(describedBy).not.toBeNull()
        expect(document.getElementById(describedBy as string)?.textContent).toBe(
            'At least twelve characters.',
        )
    })

    it('announces an error, and marks the field invalid', () => {
        render(
            <Field label="Email address" error="Enter your email address.">
                {(props) => <input {...fieldInputProps(props)} />}
            </Field>,
        )

        const alert = screen.getByRole('alert')
        expect(alert.textContent).toBe('Enter your email address.')
        expect(screen.getByLabelText('Email address').getAttribute('aria-invalid')).toBe('true')
    })

    it('gives each field its own ids, so two on a page do not collide', () => {
        render(
            <>
                <Field label="Email address">
                    {(props) => <input {...fieldInputProps(props)} />}
                </Field>
                <Field label="Password">
                    {(props) => <input {...fieldInputProps(props)} />}
                </Field>
            </>,
        )

        expect(screen.getByLabelText('Email address').id).not.toBe(
            screen.getByLabelText('Password').id,
        )
    })
})

describe('feedback', () => {
    it('interrupts for an error and does not for a status', () => {
        // A refused sign-in is the one thing that matters at that moment; a
        // loading message that interrupts is worse than none.
        const { rerender } = render(<Alert tone="error">Those credentials do not match.</Alert>)
        expect(screen.getByRole('alert').textContent).toBe('Those credentials do not match.')

        rerender(<Alert tone="status">Signed in.</Alert>)
        expect(screen.queryByRole('alert')).toBeNull()
        expect(screen.getByRole('status').textContent).toBe('Signed in.')
    })
})

describe('primitives', () => {
    it('names a titled card for a screen reader', () => {
        render(<Card title="Your bookings">Nothing yet.</Card>)

        expect(screen.getByRole('region', { name: 'Your bookings' })).toBeDefined()
    })

    it('distinguishes an empty state from a failure', () => {
        // User story 54: a dashboard with no data has told the person something,
        // and one that failed to load has not. Different components, not a flag.
        render(<EmptyState title="No bookings yet">Bookings appear here once you make one.</EmptyState>)

        expect(screen.getByText('No bookings yet')).toBeDefined()
    })

    it('gives a button a focus ring rather than removing one', () => {
        render(<Button>Sign in</Button>)

        const button = screen.getByRole('button', { name: 'Sign in' })
        expect(button.className).toMatch(/focus-visible:outline-2/)
        expect(button.className).not.toMatch(/outline-none/)
    })
})
