'use client'

import { Alert, AppShell, Button, Field, fieldInputProps, type ShellSection } from '@fixmate/ui'
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
import { describeSignInFailure, type SignInFailure } from '../sign-in-failure'

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
}

export interface Application {
    session: Session
    /** Wraps the tree. Restores the session once, for every page. */
    SessionProvider: ComponentType<{ children: ReactNode }>
    /** The signed-in chrome: header, navigation, sign-out. */
    ApplicationShell: ComponentType<{ children: ReactNode }>
    /** The whole sign-in screen, including its own redirects. */
    SignInScreen: ComponentType
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
                router.replace(next ?? homePath)
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

                    router.replace(next ?? homePath)
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

    return { session, SessionProvider, ApplicationShell, SignInScreen }
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
