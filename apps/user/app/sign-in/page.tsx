'use client'

import { useSession } from '@/app/session-provider'
import { session } from '@/lib/api'
import { describeSignInFailure, type SignInFailure } from '@/lib/sign-in-failure'
import { Alert, Button, Field, fieldInputProps } from '@fixmate/ui'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState, type FormEvent } from 'react'

/**
 * The sign-in screen.
 *
 * **A separate address, not a modal over the dashboard.** That is user story 27
 * and it is why this is `/sign-in/` rather than a dialog: on a shared device a
 * modal leaves the previous person's dashboard rendered underneath it, complete
 * with their name and their bookings, while the next person types a password.
 * A whole address leaves nothing behind.
 *
 * A client component, and it has to be one: the request is made from the
 * browser to the back end, not from a server, because the application is a
 * static export with nothing behind it. The page is still prerendered —
 * `next build` writes this to `out/sign-in/index.html` — and the form only
 * becomes interactive when the JavaScript beside it loads.
 *
 * Three things happen here that a plain form would not do, and all three are
 * about a person arriving rather than choosing to: it returns them to where they
 * were, it says why it is being shown, and it asks the session to read the
 * account so the shell can name it correctly.
 */
export default function SignInPage() {
    return (
        <Suspense fallback={<main className="min-h-screen" />}>
            <SignInForm />
        </Suspense>
    )
}

/**
 * The form itself, split out so the `Suspense` boundary above can wrap it:
 * `useSearchParams` has no value to read while the page is being prerendered.
 */
function SignInForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const next = searchParams.get('next')
    const { state, ready, endedBecause, refresh } = useSession()

    const [pending, setPending] = useState(false)
    const [failure, setFailure] = useState<SignInFailure | null>(null)

    useEffect(() => {
        // Already signed in, and not because of anything this page did — most
        // likely a person who followed a link here while their session was fine.
        // Sending them onward is less surprising than telling them to sign in
        // again.
        if (ready && state === 'signed-in') {
            router.replace(next ?? '/')
        }
    }, [ready, state, next, router])

    async function signIn(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        const form = new FormData(event.currentTarget)
        setPending(true)
        setFailure(null)

        try {
            await session.signIn(
                String(form.get('email') ?? ''),
                String(form.get('password') ?? ''),
            )

            // Read the account before navigating, so the shell that renders on
            // the other side already knows who it belongs to. Otherwise the
            // header would flash "Checking…" and then correct itself, which on a
            // shared device is exactly the moment somebody looks.
            await refresh()

            router.replace(next ?? '/')
        } catch (error) {
            setFailure(describeSignInFailure(error))
        } finally {
            setPending(false)
        }
    }

    const explanation = explanationFor(endedBecause, ready)

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
            <header className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
                <p className="text-slate-600 dark:text-slate-300">
                    This is the end user&rsquo;s door. A worker, administrator or super
                    administrator account is not accepted here.
                </p>
            </header>

            {explanation !== null && (
                <Alert tone="info" data-session-ended={endedBecause ?? undefined}>
                    {explanation}
                </Alert>
            )}

            <form onSubmit={signIn} className="flex flex-col gap-5" noValidate={false}>
                <Field label="Email address">
                    {(props) => (
                        <input
                            {...fieldInputProps(props, {
                                name: 'email',
                                type: 'email',
                                autoComplete: 'username',
                                required: true,
                                className:
                                    'rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900',
                            })}
                        />
                    )}
                </Field>

                <Field label="Password">
                    {(props) => (
                        <input
                            {...fieldInputProps(props, {
                                name: 'password',
                                type: 'password',
                                autoComplete: 'current-password',
                                required: true,
                                className:
                                    'rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900',
                            })}
                        />
                    )}
                </Field>

                <Button type="submit" disabled={pending}>
                    {pending ? 'Signing in…' : 'Sign in'}
                </Button>

                {/*
                    Assertive, because a refusal is the one thing on the screen
                    that matters at that moment. A polite region would let
                    somebody finish typing before it was read.
                */}
                {failure !== null && <Alert tone="error">{failure.message}</Alert>}
            </form>
        </main>
    )
}

/**
 * What to say about a session that has ended, and when to say nothing.
 *
 * Nothing before the restore has been attempted, because "your session has
 * ended" is a claim about something not yet established — and a first-time
 * visitor must not be greeted with it.
 *
 * `signed-out` is deliberately silent: somebody who pressed "sign out" knows
 * exactly why they are here, and being told "your session has ended" would read
 * as a fault.
 */
function explanationFor(reason: string | null, ready: boolean): string | null {
    if (!ready || reason === null || reason === 'signed-out') {
        return null
    }

    return reason === 'refused'
        ? 'Your account cannot be used at the moment. Please contact an administrator.'
        : 'Your session has ended. Please sign in again.'
}
