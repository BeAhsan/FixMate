'use client'

import { useSession } from '@/app/session-provider'
import { session, type SessionEndReason } from '@/lib/api'
import { describeSignInFailure, type SignInFailure } from '@/lib/sign-in-failure'
import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, Suspense, useEffect, useState } from 'react'

/**
 * The sign-in screen.
 *
 * A client component, and it has to be one: the request is made from the
 * browser to the back end, not from a server, because the application is a
 * static export with nothing behind it. The page itself is still prerendered —
 * `next build` writes this to `out/sign-in/index.html` — and the form only
 * becomes interactive when the JavaScript beside it loads.
 *
 * Three things happen here that a plain form would not do, and all three are
 * about a person arriving here rather than choosing to:
 *
 *   - **It restores the session on load.** An access token lives in memory and
 *     does not survive a reload, so a page load starts by spending the stored
 *     renewal token for a new one. Somebody who reloads stays signed in; without
 *     this they would be shown this form on every refresh.
 *   - **It says why it is here.** A sign-in screen that appears without warning
 *     reads as though the person was never signed in, or as though something was
 *     wrong with their account. The session layer knows the difference between a
 *     session that was ended on purpose and one that expired, and that
 *     distinction is the whole of what is useful to say here.
 *   - **It returns them to where they were.** A person sent here from a page
 *     they were reading should end up back on it, not on their new dashboard.
 *
 * `useSearchParams` is why this is wrapped in `<Suspense>` at the bottom: during
 * a static export Next.js prerenders this component, and a hook that reads the
 * query string has no value to read at that moment.
 */
export default function SignInPage() {
    return (
        <Suspense fallback={<main className="min-h-screen" />}>
            <SignInForm />
        </Suspense>
    )
}

/**
 * The form itself, split out so the `Suspense` boundary above can wrap it.
 */
function SignInForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const next = searchParams.get('next')

    // The restore itself lives in the layout's provider, so it happens on every
    // page rather than only on this one. This screen only *reacts* to the
    // outcome.
    const { state, endedBecause, ready } = useSession()

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

            // Back where they came from, or to the landing page.
            router.replace(next ?? '/')
        } catch (error) {
            setFailure(describeSignInFailure(error))
        } finally {
            setPending(false)
        }
    }

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
            <header className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
                <p className="text-slate-600 dark:text-slate-300">
                    This is the end user&rsquo;s door. A worker, administrator or super
                    administrator account is not accepted here.
                </p>
            </header>

            {explanationFor(endedBecause, ready) !== null && (
                <p
                    data-session-ended={endedBecause}
                    role="status"
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                >
                    {explanationFor(endedBecause, ready)}
                </p>
            )}

            <form onSubmit={signIn} className="flex flex-col gap-4">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium">Email address</span>
                        <input
                            name="email"
                            type="email"
                            autoComplete="username"
                            required
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                        />
                    </label>

                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium">Password</span>
                        <input
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                        />
                    </label>

                    <button
                        type="submit"
                        disabled={pending}
                        className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
                    >
                        {pending ? 'Signing in…' : 'Sign in'}
                    </button>

                    {failure !== null && (
                        <p
                            data-sign-in-result="error"
                            role="alert"
                            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                        >
                            {failure.message}
                        </p>
                    )}
            </form>
        </main>
    )
}

/**
 * What to say about a session that has ended, and when to say nothing.
 *
 * Nothing is said before the restore has been attempted, because "your session
 * has ended" is a claim about something we have not established yet — and a
 * first-time visitor must not be greeted with it.
 *
 * `signed-out` is deliberately silent: somebody who pressed "sign out" knows
 * exactly why they are here, and being told "your session has ended" would read
 * as a fault.
 */
function explanationFor(reason: SessionEndReason | null, ready: boolean): string | null {
    if (!ready || reason === null || reason === 'signed-out') {
        return null
    }

    return reason === 'refused'
        ? 'Your account cannot be used at the moment. Please contact an administrator.'
        : 'Your session has ended. Please sign in again.'
}
