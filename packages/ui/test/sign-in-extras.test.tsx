import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PasswordField, PrivacyNotice } from '../src'

/**
 * The two things story 18 and story 22 added to the sign-in screen.
 *
 * Both are invisible in a screenshot, which is the whole reason they are tested
 * here. A password field that reveals looks identical to one that does not until
 * somebody presses the button; a privacy notice is a paragraph nobody looks at.
 * What can be checked is the behaviour: the field's type changes and changes
 * back, the label is still tied to the input, the control does not submit the
 * form it sits in, and the keyboard reaches the input before the toggle.
 */

afterEach(cleanup)

describe('a password field that can be read back', () => {
    it('starts hidden and reveals on request', async () => {
        const person = userEvent.setup()

        render(<PasswordField label="Password" name="password" autoComplete="current-password" />)

        const input = screen.getByLabelText('Password')
        expect(input.getAttribute('type')).toBe('password')

        await person.click(screen.getByRole('button', { name: 'Show password' }))

        expect(input.getAttribute('type')).toBe('text')
    })

    it('hides again', async () => {
        const person = userEvent.setup()

        render(<PasswordField label="Password" name="password" autoComplete="current-password" />)

        await person.click(screen.getByRole('button', { name: 'Show password' }))
        await person.click(screen.getByRole('button', { name: 'Hide password' }))

        expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password')
    })

    it('keeps the value while the type changes', async () => {
        const person = userEvent.setup()

        render(<PasswordField label="Password" name="password" autoComplete="current-password" />)

        const input = screen.getByLabelText('Password')
        await person.type(input, 'hunter2')
        await person.click(screen.getByRole('button', { name: 'Show password' }))

        // A control that swapped the input for a second one would silently clear
        // the field, and the person would be looking at their own password being
        // deleted as they pressed the button meant to show it to them.
        expect((input as HTMLInputElement).value).toBe('hunter2')
    })

    it('labels the input, so the control is not the only way to find it', () => {
        render(<PasswordField label="Password" name="password" autoComplete="current-password" />)

        // Tied by the generated id, which is what `Field` does for every other
        // field in this design system and what this one inherits by being built
        // on it.
        expect(screen.getByLabelText('Password')).toBeDefined()
    })

    it('reaches the input before the toggle, in that order', async () => {
        const person = userEvent.setup()

        render(<PasswordField label="Password" name="password" autoComplete="current-password" />)

        await person.tab()
        expect(document.activeElement).toBe(screen.getByLabelText('Password'))

        // Tab order follows DOM order, so the control is *after* the field. An eye
        // icon floated to the left of the input would be reached first, and a
        // keyboard user tabbing through the form would toggle the reveal before
        // ever reaching the password.
        await person.tab()
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show password' }))
    })

    it('is a plain button, so it cannot submit the form it sits in', async () => {
        render(
            <form onSubmit={vi.fn()}>
                <PasswordField label="Password" name="password" autoComplete="current-password" />
            </form>,
        )

        // A button inside a form defaults to submitting. A reveal control that
        // submitted would sign the person in with a half-typed password.
        //
        // Asserted on the attribute rather than on `onSubmit` not being called,
        // because **jsdom does not implement form submission from a button
        // click**: the first version of this test asserted that, passed with the
        // `type="button"` deleted, and was asserting nothing. The attribute is the
        // property a browser actually reads, and it is the one that can be checked
        // here.
        expect(screen.getByRole('button', { name: 'Show password' }).getAttribute('type')).toBe(
            'button',
        )
    })

    it('tells a password manager whether this is the current or a new password', () => {
        const { unmount } = render(
            <PasswordField label="Password" name="password" autoComplete="current-password" />,
        )
        expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password')
        unmount()

        render(<PasswordField label="Password" name="password" autoComplete="new-password" />)
        // Story 17 is the password manager recognising the form, and a wrong
        // autocomplete value is a reason for it to offer nothing at all.
        expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password')
    })

    it('announces an error against the input, not beside it', () => {
        render(
            <PasswordField
                label="Password"
                name="password"
                autoComplete="current-password"
                error="That password is not acceptable."
            />,
        )

        const input = screen.getByLabelText('Password')
        const alert = screen.getByRole('alert')

        expect(input.getAttribute('aria-invalid')).toBe('true')
        expect(input.getAttribute('aria-describedby')).toContain(alert.id)
    })

    it('reports what was typed to a caller keeping its own state', async () => {
        const person = userEvent.setup()
        const onValueChange = vi.fn()

        render(
            <PasswordField
                label="Password"
                name="password"
                autoComplete="current-password"
                onValueChange={onValueChange}
            />,
        )

        await person.type(screen.getByLabelText('Password'), 'ab')

        expect(onValueChange).toHaveBeenCalledTimes(2)
        expect(onValueChange).toHaveBeenLastCalledWith('ab')
    })
})

describe('the privacy notice', () => {
    it('is on the sign-in screen, under a heading that names it', () => {
        render(<PrivacyNotice />)

        // A landmark with an accessible name, so somebody navigating by region
        // can find it rather than having to read the whole page to notice it.
        const notice = screen.getByRole('complementary', { name: 'What happens when you sign in' })
        expect(notice).toBeDefined()
    })

    it('says what is actually sent, and claims nothing this repository cannot support', () => {
        render(<PrivacyNotice />)

        const text = screen.getByRole('complementary').textContent ?? ''

        // Claimed, and verifiable: the sign-in call, the browser-storage rule, the
        // rotation, the throttle.
        expect(text).toMatch(/email address and password are sent/i)
        expect(text).toMatch(/never stored by this page/i)
        expect(text).toMatch(/renewal token/i)
        expect(text).toMatch(/replaced every time it is used/i)
        expect(text).toMatch(/failed attempts/i)

        // Deliberately absent. Each of these is a real part of a privacy notice
        // and none of them is something this codebase can currently support, so
        // claiming them would be worse than omitting them.
        expect(text).not.toMatch(/retain|kept for|how long/i)
        expect(text).not.toMatch(/we (?:never|do not) share|third part/i)
        expect(text).not.toMatch(/delete your account|right to erasure/i)
    })
})
