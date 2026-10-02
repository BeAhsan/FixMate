'use client'

import type { RegistrationInput, RegistrationResult } from '@fixmate/api-client'
import { Alert, Field, PasswordField, fieldInputProps } from '@fixmate/ui'
import { useState } from 'react'
import { MockedDataNotice } from './mocked-data-notice'
import { JAKARTA_FONT_CLASS } from './typeface'
import { ACTION, CARD, GROUND, INK, INK_SOFT, PILL_ON } from './tokens'

/**
 * The Customer Registration frame, built to the design and posted to the mocked
 * endpoint.
 *
 * ## The screen is honest about succeeding
 *
 * The endpoint answers `201`, and a screen that treated that as "you now have an
 * account" would be making a promise the back end does not keep — there is no
 * registration in this platform, and accounts exist only because an operator ran
 * `fixmate:create-account`. So the success state names what happened: an example
 * was posted and echoed back, and **no account was created and nothing has been
 * signed in.**
 *
 * That sentence is the difference between a mock and a lie. A person who submits
 * this form, sees a green tick and a name, and then finds they cannot sign in has
 * been told something false by a screen that looked finished.
 *
 * The `token` in the response is deliberately **not** stored, displayed or used.
 * It is a random string nothing accepts, and the one thing that would be easy and
 * wrong here is to treat it as a session credential and call `signIn` — so it is
 * never read at all.
 *
 * ## Why the submit button is not disabled on a half-filled form
 *
 * Validation happens on submit and reports per field. Disabling the button until
 * every field is valid removes the only way a person learns *which* field is
 * wrong, and replaces it with a button that silently does nothing — which is the
 * "appears to have done nothing" outcome the booking screen's docblock argues
 * against.
 */
export function CustomerRegistration({
    loadRegistration,
    onSignInInstead,
}: {
    loadRegistration: (input: RegistrationInput) => Promise<RegistrationResult>
    onSignInInstead: () => void
}) {
    const [values, setValues] = useState({ name: '', email: '', password: '' })
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [failure, setFailure] = useState<string | null>(null)
    const [registered, setRegistered] = useState<RegistrationResult | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const update = (field: keyof typeof values) => (value: string) => {
        setValues((previous) => ({ ...previous, [field]: value }))
        setErrors((previous) => ({ ...previous, [field]: '' }))
    }

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        const found = validate(values)

        setErrors(found)
        setFailure(null)

        if (Object.keys(found).length > 0) {
            return
        }

        setSubmitting(true)

        try {
            const result = await loadRegistration({
                name: values.name,
                email: values.email,
                password: values.password,
            })

            setRegistered(result)
        } catch (error: unknown) {
            setFailure(describeRegistrationFailure(error))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className={`flex min-h-screen flex-col ${GROUND} ${JAKARTA_FONT_CLASS}`}>
            <header className="border-b border-[#F1F5F9] dark:border-[#243350]">
                <div className="mx-auto flex w-full max-w-md flex-col gap-1 px-5 py-6">
                    <span className="text-xs font-semibold uppercase tracking-widest text-[#0F5B55] dark:text-[#6FFBBE]">
                        FixMate
                    </span>
                    <h1 className={`text-2xl font-bold tracking-tight ${INK}`}>Join FixMate</h1>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
                {registered !== null ? (
                    <Registered result={registered} onSignInInstead={onSignInInstead} />
                ) : (
                    <>
                        <MockedDataNotice detail="Submitting this form posts an example to the back end and shows what comes back. It does not create an account." />

                        {failure !== null && <Alert tone="error">{failure}</Alert>}

                        <form
                            onSubmit={submit}
                            noValidate
                            className={`flex flex-col gap-5 p-6 ${CARD}`}
                        >
                            <Field
                                label="Full name"
                                error={errors.name}
                                hint="As it should appear on a booking."
                            >
                                {(props) => (
                                    <input
                                        {...fieldInputProps(props, {
                                            type: 'text',
                                            name: 'name',
                                            autoComplete: 'name',
                                            value: values.name,
                                            onChange: (event) => update('name')(event.target.value),
                                            className: INPUT,
                                        })}
                                    />
                                )}
                            </Field>

                            <Field label="Email" error={errors.email}>
                                {(props) => (
                                    <input
                                        {...fieldInputProps(props, {
                                            type: 'email',
                                            name: 'email',
                                            autoComplete: 'email',
                                            value: values.email,
                                            onChange: (event) => update('email')(event.target.value),
                                            className: INPUT,
                                        })}
                                    />
                                )}
                            </Field>

                            <PasswordField
                                label="Password"
                                name="password"
                                autoComplete="new-password"
                                error={errors.password}
                                className={INPUT}
                                onValueChange={update('password')}
                            />

                            <button
                                type="submit"
                                disabled={submitting}
                                className={`rounded-xl px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${PILL_ON} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F5B55] dark:focus-visible:outline-[#6FFBBE]`}
                            >
                                {submitting ? 'Creating account…' : 'I agree to Terms & Conditions'}
                            </button>
                        </form>

                        <p className={`text-center text-sm ${INK_SOFT}`}>
                            Already have an account?{' '}
                            <button
                                type="button"
                                onClick={onSignInInstead}
                                className={`font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F5B55] dark:focus-visible:outline-[#6FFBBE]`}
                            >
                                Sign in
                            </button>
                        </p>
                    </>
                )}
            </main>
        </div>
    )
}

/**
 * The success state, and the part of this screen that matters most.
 *
 * **`No account was created` is in the heading, not in a footnote.** The endpoint
 * answers `201` and the design shows a success panel; a person who stops reading
 * after the panel has been told their account exists. So the one sentence that
 * makes that untrue is the sentence they cannot miss.
 *
 * The echoed name and email are shown because the design shows them — they are
 * what was sent, and displaying them demonstrates the round trip worked. They are
 * labelled as echoes for the same reason.
 */
export function Registered({
    result,
    onSignInInstead,
}: {
    result: RegistrationResult
    onSignInInstead: () => void
}) {
    return (
        <section
            aria-label="Registration complete"
            className={`flex flex-col gap-4 p-6 ${CARD}`}
        >
            <Alert tone="status">Your details were accepted by the service.</Alert>

            {/*
              The correction, immediately below the confirmation it corrects. Two
              adjacent messages, because "accepted" and "created" are different
              claims and only one of them is true.
            */}
            <Alert tone="info">
                No account was created and nobody is signed in. There is no registration on FixMate
                yet — accounts are made by an operator — so this screen has posted an example and
                shown what came back.
            </Alert>

            <dl className="flex flex-col gap-3 text-sm">
                <div className="flex flex-col gap-0.5">
                    <dt className={`text-xs uppercase tracking-wide ${INK_SOFT}`}>Name you sent</dt>
                    <dd className={INK}>{result.user.name}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                    <dt className={`text-xs uppercase tracking-wide ${INK_SOFT}`}>Email you sent</dt>
                    <dd className={INK}>{result.user.email}</dd>
                </div>
            </dl>

            <button
                type="button"
                onClick={onSignInInstead}
                className={`rounded-xl px-4 py-3 font-semibold ${ACTION} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F5B55] dark:focus-visible:outline-[#6FFBBE]`}
            >
                Go to sign in
            </button>
        </section>
    )
}

/**
 * Client-side validation, kept to what the form can actually know.
 *
 * Deliberately does **not** check password strength: there is no policy on this
 * platform to check against, and inventing one here would be a second, different
 * policy from whatever the back end eventually has.
 *
 * Returning an object keyed by field rather than the first problem is so the
 * caller can render every message at once. Reporting one at a time makes a person
 * fix, submit, and be told about the next.
 *
 * **Exported so the policy is testable, and so nothing else can quietly grow a
 * second one.** A validity check living inside a component is a check nothing can
 * reach: it can only be exercised by filling a form in a browser and reading the
 * result, which is exactly the test that gets skipped. As a pure function it is
 * three assertions and it is the only place a field's rules are written down.
 */
export function validate(values: RegistrationInput): Record<string, string> {
    const errors: Record<string, string> = {}

    if (values.name.trim() === '') {
        errors.name = 'Enter your name.'
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
        errors.email = 'Enter an email address.'
    }

    if (values.password === '') {
        errors.password = 'Enter a password.'
    }

    return errors
}

/**
 * What to show when the request itself failed.
 *
 * The back end's message is passed through when it sent one. **The password is
 * never echoed into the failure text**, and neither is the email: a failure that
 * quotes the field it refused is a failure that puts the value in a place with
 * different retention.
 */
function describeRegistrationFailure(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = (error as { message: unknown }).message

        if (typeof message === 'string' && message !== '') {
            return message
        }
    }

    return 'Something went wrong submitting the form. Please try again.'
}

/**
 * The input class, written out rather than pulled from the design system.
 *
 * `Field` and `PasswordField` own the label association, the hint wiring and the
 * announced error — which is the part that must not drift between fields. The
 * border and padding are presentation, and duplicating them here is what lets this
 * screen match the design's rounded, generous fields without a second primitive
 * existing to disagree about it later.
 *
 * ## Why `fieldInputProps(props, …)` rather than `{...props}`
 *
 * `Field`'s render prop hands out `{ id, describedBy, invalid }` — **its own
 * spelling, not DOM attribute names.** `fieldInputProps` is what turns those into
 * `id`, `aria-describedby` and `aria-invalid`. Spreading `props` straight onto an
 * `<input>` looks equivalent and is not: it renders `describedBy="_R_1_-hint"` as
 * an attribute a browser does not recognise, so the hint is written into the
 * document and never announced with the field.
 *
 * That is invisible in a screenshot — the hint is visible on screen either way —
 * and it was exactly what happened the first time this screen was written. The
 * hint still appeared, so the bug looked like a success.
 */
const INPUT =
    'w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 dark:border-[#243350] dark:bg-[#111A2B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F5B55] dark:focus-visible:outline-[#6FFBBE]'