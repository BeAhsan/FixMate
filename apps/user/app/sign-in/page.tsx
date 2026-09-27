'use client'

import { operations } from '@/lib/api'
import { describeSignInFailure, type SignInFailure } from '@/lib/sign-in-failure'
import { setAccessToken } from '@/lib/session'
import { type FormEvent, useState } from 'react'

/**
 * The sign-in screen.
 *
 * A client component, and it has to be one: the request is made from the
 * browser to the back end, not from a server, because the application is a
 * static export with nothing behind it. The page itself is still prerendered —
 * `next build` writes this HTML to `out/sign-in/index.html` — and the form only
 * becomes interactive when the JavaScript beside it loads.
 *
 * Three refusals are told apart on purpose, because they need different things
 * from the person reading them:
 *
 *   - the back end's own message, when it sent one. The sign-in refusal names
 *     neither which part of the credentials was wrong nor whether the address
 *     exists, and a screen that paraphrased it would be saying more than the
 *     back end is willing to.
 *   - "we could not reach the back end", when there was no response at all.
 *     Without this the failure would be a blank screen, which is the one
 *     outcome that tells the person nothing about whether to retry.
 *   - "the response did not match what we expected", when a response arrived
 *     and no longer fitted the declared shape. That is a broken contract rather
 *     than a wrong password, and telling someone to check their password would
 *     be actively misleading.
 *
 * The wording itself is in lib/sign-in-failure.ts rather than here, so that it
 * can be tested without rendering a form.
 */
export default function SignInPage() {
    const [pending, setPending] = useState(false)
    const [failure, setFailure] = useState<SignInFailure | null>(null)
    const [signedInAs, setSignedInAs] = useState<string | null>(null)

    async function signIn(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        const form = new FormData(event.currentTarget)
        setPending(true)
        setFailure(null)

        try {
            const result = await operations.signInUser({
                email: String(form.get('email') ?? ''),
                password: String(form.get('password') ?? ''),
            })

            // The token goes into memory and nowhere else. See lib/session.ts.
            setAccessToken(result.token)
            setSignedInAs(`${result.user.name} <${result.user.email}>`)
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

            {signedInAs !== null ? (
                <section
                    data-sign-in-result="ok"
                    className="flex flex-col gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-950"
                >
                    <h2 className="font-semibold text-emerald-900 dark:text-emerald-100">
                        Signed in
                    </h2>
                    <p className="text-emerald-800 dark:text-emerald-200">{signedInAs}</p>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">
                        The token is in memory only. Reloading this page signs you out
                        until the renewal token arrives with ticket 16.
                    </p>
                </section>
            ) : (
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
            )}
        </main>
    )
}
