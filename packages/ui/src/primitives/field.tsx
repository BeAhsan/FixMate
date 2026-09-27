'use client'

import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

/**
 * A labelled form field.
 *
 * Three accessibility requirements met by construction rather than by
 * convention, because a form that gets them wrong is unusable with a screen
 * reader and the failure is invisible in a screenshot:
 *
 * - The `<label>` is tied to the input by a generated id, so clicking the label
 *   focuses the field and the label is announced with it. A placeholder is not a
 *   label: it disappears on the first keystroke and is not reliably announced.
 * - Any hint is wired up with `aria-describedby`, so it is read *after* the label
 *   rather than being decoration next to the control.
 * - Any error is announced. `role="alert"` on a live region means it is spoken
 *   when it appears, which is the difference between somebody finding out their
 *   password was refused and somebody finding out on the next submit.
 */
export interface FieldProps {
    label: string
    /** A hint read after the label. */
    hint?: string
    /** An error, announced when it appears. */
    error?: string | undefined
    children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}

export function Field({ label, hint, error, children }: FieldProps) {
    const id = useId()
    const hintId = `${id}-hint`
    const errorId = `${id}-error`

    const describedBy =
        [hint !== undefined ? hintId : null, error !== undefined ? errorId : null]
            .filter(Boolean)
            .join(' ') || undefined

    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">
                {label}
            </label>

            {hint !== undefined && (
                <p id={hintId} className="text-sm text-slate-600 dark:text-slate-400">
                    {hint}
                </p>
            )}

            {children({
                id,
                describedBy,
                invalid: error !== undefined,
            })}

            {/*
                `role="alert"` rather than `aria-live`: alert implies assertive,
                which is right for a refusal. A field that appears with an error
                already in it — a server-side validation failure returned with the
                form — is announced too, because the node is added while the region
                is already being observed.
            */}
            {error !== undefined && (
                <p id={errorId} role="alert" className="text-sm text-red-700 dark:text-red-300">
                    {error}
                </p>
            )}
        </div>
    )
}

/** Props for the input inside a {@link Field}, with accessibility applied. */
export function fieldInputProps(
    props: { id: string; describedBy: string | undefined; invalid: boolean },
    extra: InputHTMLAttributes<HTMLInputElement> = {},
): InputHTMLAttributes<HTMLInputElement> {
    return {
        ...extra,
        id: props.id,
        'aria-describedby': props.describedBy,
        'aria-invalid': props.invalid || undefined,
    }
}
