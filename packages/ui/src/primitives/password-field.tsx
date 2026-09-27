'use client'

import { useState } from 'react'
import { Button } from './button'
import { Field, fieldInputProps, type FieldProps } from './field'

/**
 * A password field with a control to see what has been typed.
 *
 * Story 18: somebody mistyping a character needs to find out which one, and
 * starting over is the alternative. That is not a nicety — on a phone keyboard,
 * where the character is under a finger and the field may be obscured, it is the
 * difference between correcting one character and retyping a whole password.
 *
 * Built on {@link Field} rather than around it, so the label association, the hint
 * wiring and the announced error are the same three things every other field in
 * this design system gets. A password field that grew its own markup would be the
 * one field where the label is not tied to the input, and that is invisible in a
 * screenshot.
 *
 * The button is `type="button"` and that is not cosmetic: inside a form, a button
 * defaults to submitting, so a reveal control that submitted the form would sign
 * the person in with a half-typed password.
 *
 * It sits *after* the input in the DOM, not before and not overlaid on top of it,
 * because tab order follows DOM order. An eye icon floated to the left of the
 * field would be reached before the input, and a keyboard user tabbing through the
 * form would toggle the reveal before ever reaching the password.
 *
 * `autoComplete` is a required prop rather than defaulted. The two screens that
 * use this want different values — `current-password` when signing in,
 * `new-password` when choosing one — and a password manager treats a wrong value
 * as a reason not to offer to fill the field in. Story 17 is the password manager
 * recognising the form, and a default here would quietly undo it.
 */
export interface PasswordFieldProps
    extends Pick<FieldProps, 'label' | 'hint' | 'error'> {
    name: string
    /**
     * `current-password` on a sign-in form, `new-password` when choosing one.
     * Passed explicitly because the two mean different things to a password
     * manager and there is no safe default.
     */
    autoComplete: 'current-password' | 'new-password'
    required?: boolean
    /** Called with the value on change, for a caller keeping its own state. */
    onValueChange?: (value: string) => void
}

export function PasswordField({
    label,
    hint,
    error,
    name,
    autoComplete,
    required = true,
    onValueChange,
}: PasswordFieldProps) {
    const [revealed, setRevealed] = useState(false)

    return (
        <Field label={label} hint={hint} error={error}>
            {(props) => (
                <div className="flex items-start gap-2">
                    <input
                        {...fieldInputProps(props, {
                            name,
                            // The one thing this control changes. `text` when
                            // revealed, `password` when not, and nothing else -
                            // no `aria-hidden` mirror input, which is the usual way
                            // this is built and which puts a second, unlabelled
                            // copy of a password in the accessibility tree.
                            type: revealed ? 'text' : 'password',
                            autoComplete,
                            required,
                            onChange: (event) => onValueChange?.(event.target.value),
                            className:
                                'min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900',
                        })}
                    />

                    {/*
                        The name changes rather than the name staying put with
                        `aria-pressed`. Both are used in the wild; the changing name
                        is the one that reads correctly with no state to infer,
                        because "Show password" is an instruction and "Hide
                        password" is what that instruction becomes once taken. A
                        stable name plus `aria-pressed` makes the listener work out
                        the current state before deciding what the control does.
                    */}
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setRevealed((was) => !was)}
                    >
                        {revealed ? 'Hide password' : 'Show password'}
                    </Button>
                </div>
            )}
        </Field>
    )
}
