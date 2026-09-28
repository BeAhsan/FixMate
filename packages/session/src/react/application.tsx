'use client'

import {
    Alert,
    AppShell,
    Button,
    Field,
    PasswordField,
    PrivacyNotice,
    fieldInputProps,
    type ShellSection,
} from '@fixmate/ui'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ComponentType,
    type FormEvent,
    type ReactNode,
} from 'react'
import { createAccessTokenSource } from '../access-token-source'
import { createApplicationClient, operationsFor, type ApplicationKey } from '../application-operations'
import { createSession, type Session, type SessionEndReason, type SessionState } from '../index'
import { reportUserActivity } from './report-user-activity'
import { webStorageRenewalTokenStore } from '../renewal-token-store'
import {
    describePasswordChangeFailure,
    describeSignInFailure,
    type PasswordChangeFailure,
    type SignInFailure,
} from '../sign-in-failure'

/**
 * Where to send somebody who has just signed in, or who has just finished changing
 * a password.
 *
 * A pure function rather than a line inside each of the two screens that need it,
 * for two reasons. It decides **where a person ends up**, which no amount of
 * rendering a form can check — the component test renders markup, and this is a
 * redirect. And two components making the same decision separately is how the two
 * drift apart, which is exactly what happened: the change screen used to bounce a
 * signed-out person to sign-in carrying `?next=` pointing at itself, and every
 * sign-in then took two navigations instead of one.
 */
export function destinationFor({
    mustChangePassword,
    next,
    changePasswordPath,
    homePath,
}: {
    /** Whether the account must still choose a password. */
    mustChangePassword: boolean
    /** The `?next=` target, or null when there is none. */
    next: string | null
    changePasswordPath: string
    homePath: string
}): string {
    // The change screen wins over `next`, and it has to. An account that must
    // replace its password is refused by every route except the change and
    // sign-out, so honouring `next` would land them on a dashboard whose every
    // request fails — the one outcome that tells them nothing.
    if (mustChangePassword) {
        // The `next` target is carried through rather than dropped, so somebody who
        // was on their way somewhere real gets there after the detour.
        return next === null
            ? changePasswordPath
            : `${changePasswordPath}?next=${encodeURIComponent(next)}`
    }

    // A `next` pointing back at the change screen is ignored rather than followed.
    // That value is reachable — anyone can type the address — and following it would
    // replace the address with itself and navigate again, forever, with nothing on
    // screen to explain why. It was reachable by accident too, which is why this is
    // a guard and not a coincidence.
    if (next !== null && next !== changePasswordPath) {
        return next
    }

    return homePath
}

/**
 * Everything the four applications share about being signed in.
 *
 * This layer is **Next-aware on purpose**. The sign-in flow has to redirect — to
 * the page the person came from, or home — and that needs `useRouter` and
 * `useSearchParams`. Leaving those out would mean each of the four applications
 * re-implementing the redirect, which is precisely the duplication this package
 * exists to prevent. Four near-identical Next applications in one monorepo is the
 * situation this is shaped for.
 *
 * An application supplies a *definition* and gets three components back. The
 * definition is the only place any of the four says which account type it is.
 */
export interface ApplicationDefinition {
    /** A key in the back end's `config/applications.php`. */
    application: ApplicationKey
    /** Shown in the header. */
    applicationLabel: string
    /** The back end's address. Inlined at build time; see `resolveApiBaseUrl`. */
    baseUrl: string
    /** This application's own navigation. */
    sections: readonly ShellSection[]
    /** How this door describes itself, e.g. "end user". */
    subject?: string
    /** Where sign-in lives. A separate address, never a modal over a dashboard. */
    signInPath?: string
    /** Where to send somebody who signs in with nowhere in particular to go. */
    homePath?: string
    /**
     * Where the change-password screen lives.
     *
     * A separate address for the same reason sign-in is: a person on a shared
     * device who is sent here must not find a previous session's dashboard
     * rendered behind the form, and a modal over one is exactly that.
     */
    changePasswordPath?: string
}

export interface Application {
    session: Session
    /** Wraps the tree. Restores the session once, for every page. */
    SessionProvider: ComponentType<{ children: ReactNode }>
    /** The signed-in chrome: header, navigation, sign-out. */
    ApplicationShell: ComponentType<{ children: ReactNode }>
    /** The whole sign-in screen, including its own redirects. */
    SignInScreen: ComponentType
    /**
     * The change-password screen, at its own address.
     *
     * A separate component rather than a branch inside {@link SignInScreen}
     * because it is a different job with a different set of ways out: sign-in has
     * one (sign in again), and this has two (choose a password, or sign out on a
     * shared device). Folding it into the sign-in screen would mean one component
     * deciding which of the two it is on every render.
     */
    ChangePasswordScreen: ComponentType
}

/**
 * Build one application from its definition.
 *
 * Called once per application, at module scope, in that application's
 * `lib/application.ts`. Nothing else in any application names an account type,
 * which is what makes "a front end physically cannot reach another
 * application's door" a property rather than a convention.
 */
export function createApplication(definition: ApplicationDefinition): Application {
    const signInPath = definition.signInPath ?? '/sign-in/'
    const homePath = definition.homePath ?? '/'
    const changePasswordPath = definition.changePasswordPath ?? '/change-password/'
    const subject = definition.subject ?? 'end user'

    // Order matters and is the reason the token holder is an object: the client
    // is built with a getter, and the session that writes the holder is built
    // after it.
    const { tokens, operations } = createApplicationClient(definition.baseUrl)

    const session = createSession({
        tokens,
        store: webStorageRenewalTokenStore(`fixmate.${definition.application}.renewal`),
        operations: operationsFor(operations, definition.application),
    })

    const SessionContext = createContext<{
        state: SessionState
        endedBecause: SessionEndReason | null
        ready: boolean
    }>({ state: 'unknown', endedBecause: null, ready: false })

    function useSession() {
        return useContext(SessionContext)
    }

    function SessionProvider({ children }: { children: ReactNode }) {
        const [value, setValue] = useState({
            state: session.state,
            endedBecause: session.endedBecause,
            ready: false,
        })

        useEffect(() => {
            // Guards a state update after unmount, which a fast navigation during
            // restore would otherwise cause.
            let cancelled = false

            const stop = session.subscribe((state, reason) => {
                if (!cancelled) {
                    setValue({ state, endedBecause: reason, ready: true })
                }
            })

            void session.restore().then(() => {
                if (!cancelled) {
                    setValue({
                        state: session.state,
                        endedBecause: session.endedBecause,
                        ready: true,
                    })
                }
            })

            // Real interaction feeds the session's idle deadline. In its own effect
            // so it is attached once for the provider's life and detached on
            // unmount, rather than being tied to the restore above — a listener
            // re-attached on every state change would be a listener attached
            // several times over.
            const stopReporting = reportUserActivity(session)

            return () => {
                cancelled = true
                stop()
                stopReporting()
            }
        }, [])

        const memoised = useMemo(() => value, [value])

        return <SessionContext.Provider value={memoised}>{children}</SessionContext.Provider>
    }

    function ApplicationShell({ children }: { children: ReactNode }) {
        const router = useRouter()
        const pathname = usePathname()
        const { ready } = useSession()
        const account = session.account()

        return (
            <AppShell
                identity={{
                    application: definition.application,
                    applicationLabel: definition.applicationLabel,
                    // The back end's answer, never a guess. Null only in the
                    // moment before it arrives, and shown as "Checking…" rather
                    // than filled in — a shell that labelled itself would be
                    // labelling itself on trust.
                    accountType: account?.accountType ?? 'Checking…',
                    accountName: account?.name,
                    accountEmail: account?.email,
                }}
                sections={definition.sections}
                // Empty while unknown, which hides every ability-scoped section
                // rather than offering one that will be refused.
                abilities={account?.abilities ?? []}
                currentPath={pathname}
                ready={ready}
                onSignOut={() => {
                    // The back end revokes every token this account holds, which
                    // is what ends the session in the other three applications.
                    // This one is signed out locally whatever the network says.
                    void session.signOut().then(() => router.replace(signInPath))
                }}
            >
                {children}
            </AppShell>
        )
    }

    const destinationAfterSignIn = (next: string | null) =>
        destinationFor({
            mustChangePassword: session.mustChangePassword(),
            next,
            changePasswordPath,
            homePath,
        })

    function SignInScreen() {
        const router = useRouter()
        const searchParams = useSearchParams()
        const { state, ready, endedBecause } = useSession()
        const next = searchParams.get('next')

        const [pending, setPending] = useState(false)
        const [failure, setFailure] = useState<SignInFailure | null>(null)

        useEffect(() => {
            // Already signed in, and not because of anything this screen did —
            // most likely somebody who followed a link here while their session
            // was fine.
            if (ready && state === 'signed-in') {
                router.replace(destinationAfterSignIn(next))
            }
        }, [ready, state, next, router])

        const onSignIn = useCallback(
            async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault()

                const form = new FormData(event.currentTarget)
                setPending(true)
                setFailure(null)

                try {
                    await session.signIn(
                        String(form.get('email') ?? ''),
                        String(form.get('password') ?? ''),
                    )

                    router.replace(destinationAfterSignIn(next))
                } catch (error) {
                    setFailure(describeSignInFailure(error))
                } finally {
                    setPending(false)
                }
            },
            [next, router],
        )

        return (
            <SignInForm
                pending={pending}
                failure={failure}
                endedBecause={endedBecause}
                ready={ready}
                subject={subject}
                onSignIn={onSignIn}
            />
        )
    }

    function ChangePasswordScreen() {
        const router = useRouter()
        const searchParams = useSearchParams()
        const { state, ready } = useSession()
        const next = searchParams.get('next')

        const [pending, setPending] = useState(false)
        const [failure, setFailure] = useState<PasswordChangeFailure | null>(null)

        useEffect(() => {
            // Signed out: there is no session to change a password on, and the back
            // end would refuse the call with a 401 that says nothing useful. Send
            // them to sign in, which the sign-in screen will route straight back
            // here when the flag says so.
            //
            // **No `?next=`,** and that is the whole reason this is a comment rather
            // than nothing. Pointing it at this screen is circular: the flag already
            // brings a flagged person back here, so the parameter buys nothing and
            // costs a navigation — after the change, `next` would send them back to
            // a screen whose flag is now clear, which immediately redirects them
            // onwards, so the detour happens on every single sign-in. An unflagged
            // person is no better served: the flag says nothing, and they are sent
            // to the change screen only to be told there is nothing to do.
            if (ready && state === 'signed-out') {
                router.replace(signInPath)
            }
        }, [ready, state, router])

        useEffect(() => {
            // Signed in and the flag is already clear: they have been here before,
            // or they arrived by typing the address. Either way there is nothing to
            // do on this screen, and leaving them on a form that will be refused is
            // worse than sending them where they meant to go. Where they meant to go
            // is the same decision the sign-in screen makes, which is why it is one
            // function — see `destinationFor`.
            if (ready && state === 'signed-in' && !session.mustChangePassword()) {
                router.replace(
                    destinationFor({
                        mustChangePassword: false,
                        next,
                        changePasswordPath,
                        homePath,
                    }),
                )
            }
        }, [ready, state, next, router])

        const onChangePassword = useCallback(
            async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault()

                const form = new FormData(event.currentTarget)
                const current = String(form.get('current_password') ?? '')
                const replacement = String(form.get('password') ?? '')
                const repeated = String(form.get('password_confirmation') ?? '')

                // Checked here as well as on the back end, and the back end checks
                // it too. Not redundant: this one gives the answer without a round
                // trip and without the new password ever leaving the browser, which
                // matters more than usual on the one screen where a shared device is
                // the likely reason for being here.
                if (replacement !== repeated) {
                    setFailure({
                        message: 'The two new passwords do not match.',
                        fields: { password_confirmation: ['The two new passwords do not match.'] },
                    })

                    return
                }

                setPending(true)
                setFailure(null)

                try {
                    await session.changePassword(current, replacement)
                    // `mustChangePassword: false`, not the session's own value: the
                    // change has just cleared the flag, and reading it back here
                    // would make the reader work out that a cleared flag means "send
                    // them onwards".
                    router.replace(
                        destinationFor({
                            mustChangePassword: false,
                            next,
                            changePasswordPath,
                            homePath,
                        }),
                    )
                } catch (error) {
                    setFailure(describePasswordChangeFailure(error))
                } finally {
                    setPending(false)
                }
            },
            [next, router],
        )

        return (
            <ChangePasswordForm
                pending={pending}
                failure={failure}
                ready={ready}
                onChangePassword={onChangePassword}
                onSignOut={() => {
                    // Not a convenience. A person on a shared device who is sent
                    // here is *most* entitled to leave without choosing a password,
                    // and the back end exempts sign-out from its guard for exactly
                    // this reason. Refusing it would trap them on a screen they came
                    // to in order to leave.
                    void session.signOut().then(() => router.replace(signInPath))
                }}
            />
        )
    }

    return {
        session,
        SessionProvider,
        ApplicationShell,
        SignInScreen,
        ChangePasswordScreen,
    }
}

/**
 * The form's markup and accessibility, kept separate from the routing so it can
 * be read — and tested — without a router.
 */
export interface SignInFormProps {
    pending: boolean
    failure: SignInFailure | null
    endedBecause: SessionEndReason | null
    ready: boolean
    onSignIn: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
    subject?: string
}

export function SignInForm({
    pending,
    failure,
    endedBecause,
    ready,
    onSignIn,
    subject = 'end user',
}: SignInFormProps) {
    const explanation = explanationFor(endedBecause, ready)

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
            <header className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
                <p className="text-slate-600 dark:text-slate-300">
                    This is the {subject}&rsquo;s door. An account of any other type is not
                    accepted here.
                </p>
            </header>

            {explanation !== null && <Alert tone="info">{explanation}</Alert>}

            <form onSubmit={onSignIn} className="flex flex-col gap-5">
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

                {/*
                    The design system's password field rather than an input with a
                    `type` on it, so the reveal control and this label association
                    are the same in the four applications as they are in the reset
                    flow. `current-password` is what tells a password manager this
                    is an existing password rather than a new one.
                */}
                <PasswordField
                    label="Password"
                    name="password"
                    autoComplete="current-password"
                />

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

            {/*
                After the form, not before it. A notice above the fold competes
                with the thing the person came to do, and this one is on the same
                screen either way.
            */}
            <PrivacyNotice />
        </main>
    )
}

/**
 * The change-password screen's markup and accessibility, kept separate from the
 * routing for the same reason {@link SignInForm} is.
 *
 * Three fields, and the third is the one that is easy to leave out. A person
 * choosing a password for the first time has no memory of what they just typed,
 * and this is the screen most likely to be reached on a shared device by somebody
 * in a hurry, so the repeat is the difference between a working password and a
 * lockout discovered at the next sign-in.
 */
export interface ChangePasswordFormProps {
    pending: boolean
    failure: PasswordChangeFailure | null
    ready: boolean
    onChangePassword: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
    onSignOut: () => void | Promise<void>
}

export function ChangePasswordForm({
    pending,
    failure,
    ready,
    onChangePassword,
    onSignOut,
}: ChangePasswordFormProps) {
    return (
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
            <header className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
                <p className="text-slate-600 dark:text-slate-300">
                    Your account was set up with a password that was shared with you. Choose one
                    of your own before you use it.
                </p>
            </header>

            {/*
                `aria-busy` rather than nothing, so the screen is announced as busy
                while the session is still being restored. The form is rendered either
                way: a person who reaches this address directly is not signed in, and
                showing them a spinner for a moment is better than a blank page.
            */}
            <form
                onSubmit={onChangePassword}
                aria-busy={ready ? undefined : true}
                className="flex flex-col gap-5"
            >
                {/*
                    `current-password` rather than `new-password` on the first field,
                    and it matters: a password manager that is told the whole form is
                    creating a new credential will offer to *generate* one, and may
                    fill this box with a guess rather than the shared password this
                    screen exists to replace.
                */}
                <PasswordField
                    label="Current password"
                    name="current_password"
                    autoComplete="current-password"
                    error={failure?.fields?.['current_password']?.[0]}
                />

                <PasswordField
                    label="New password"
                    name="password"
                    autoComplete="new-password"
                    error={failure?.fields?.['password']?.[0]}
                />

                {/*
                    A plain `Field` rather than a second `PasswordField`: the reveal
                    control is for checking a character you mistyped, and having three
                    of them on one form is noise. This is a confirmation, and the
                    value is compared for equality rather than read.
                */}
                <PasswordField
                    label="Confirm new password"
                    name="password_confirmation"
                    autoComplete="new-password"
                    error={failure?.fields?.['password_confirmation']?.[0]}
                />

                <Button type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Save and continue'}
                </Button>

                {/* Assertive, for the same reason the sign-in refusal is. */}
                {failure !== null && failure.fields === undefined && (
                    <Alert tone="error">{failure.message}</Alert>
                )}
            </form>

            {/*
                After the form and out of the way of it. The person is not here to sign
                out — they are here because they were sent — so it is the quiet
                second thing on the screen rather than a competing first one.
            */}
            <div>
                <Button type="button" variant="secondary" onClick={() => void onSignOut()}>
                    Sign out instead
                </Button>
            </div>
        </main>
    )
}

/**
 * What to say about a session that has ended, and when to say nothing.
 *
 * Nothing before the restore has been attempted, because "your session has
 * ended" is a claim about something not yet established — and a first-time
 * visitor must not be greeted with it. That path runs on *every* first page load,
 * so it is the most commonly seen state in the application.
 *
 * `signed-out` is deliberately silent: somebody who pressed "sign out" knows
 * exactly why they are here, and being told their session ended would read as a
 * fault.
 */
export function explanationFor(reason: SessionEndReason | null, ready: boolean): string | null {
    if (!ready || reason === null || reason === 'signed-out') {
        return null
    }

    return reason === 'refused'
        ? 'Your account cannot be used at the moment. Please contact an administrator.'
        : 'Your session has ended. Please sign in again.'
}

export { createAccessTokenSource }
