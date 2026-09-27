'use client'

import { session, whoAmI, type SessionEndReason, type SessionState } from '@/lib/api'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * Restores the session once, for the whole application, and knows who it belongs
 * to.
 *
 * In the root layout rather than in each page, because the access token lives in
 * memory and a reload destroys it — so *every* page has to spend the renewal
 * token on arrival, and a per-page `restore()` is a per-page chance to forget.
 * That is not hypothetical: with the restore living on the sign-in screen alone,
 * reloading the landing page left the renewal token untouched and the person
 * signed out, which is the exact failure this arrangement exists to prevent.
 *
 * ## Why it also asks who the account is
 *
 * The abilities a token carries are not in the token *string*; they are
 * something the back end knows and the browser is told. `whoAmI` asks once the
 * session is established, and the answer is what the navigation is filtered by
 * and what the header names.
 *
 * Fetched rather than read out of storage, for two reasons. The back end is the
 * only thing that knows, so a front end that guessed would be guessing; and a
 * token restored from storage may belong to a suspended account or to the wrong
 * account type, which is a 403 here rather than a working session. It costs one
 * request per page load, which is a request a dashboard was going to make anyway.
 *
 * ## Why it fails closed
 *
 * If the account cannot be read, the abilities stay empty, which hides every
 * ability-scoped section rather than offering one that will be refused. The
 * back end refuses either way — this is the courtesy, not the protection — but
 * the direction of the failure is the difference between a section missing for a
 * moment and a dead link somebody clicks.
 */
interface SessionContextValue {
    state: SessionState
    endedBecause: SessionEndReason | null
    /** False until the first restore has been attempted, so a shell can wait. */
    ready: boolean
    /** The live account type, or null before the answer has arrived. */
    accountType: string | null
    accountName: string | null
    accountEmail: string | null
    /** The token's abilities. Empty hides everything that needs one. */
    abilities: string[]
    /**
     * Re-read the account, for a caller that has just signed in.
     *
     * Separate from the restore effect because signing in is a different event:
     * the effect runs on page load, this runs after the sign-in screen's own
     * call. Both end up in the same state, and the sign-in screen does not have
     * to know how the account is read.
     */
    refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue>({
    state: 'unknown',
    endedBecause: null,
    ready: false,
    accountType: null,
    accountName: null,
    accountEmail: null,
    abilities: [],
    refresh: async () => {},
})

export function useSession(): SessionContextValue {
    return useContext(SessionContext)
}

export function SessionProvider({ children }: { children: ReactNode }) {
    const [value, setValue] = useState<Omit<SessionContextValue, 'refresh'>>({
        state: session.state,
        endedBecause: session.endedBecause,
        ready: false,
        accountType: null,
        accountName: null,
        accountEmail: null,
        abilities: [],
    })

    // Bumping this re-runs the effect below, which is how a sign-in gets the
    // account read without the sign-in screen having to know how.
    const [refreshToken, setRefreshToken] = useState(0)

    useEffect(() => {
        let cancelled = false

        const read = async () => {
            try {
                const account = await whoAmI()

                if (!cancelled) {
                    setValue((current) => ({
                        ...current,
                        accountType: account.account_type,
                        accountName: account.account.name,
                        accountEmail: account.account.email,
                        abilities: account.abilities,
                    }))
                }
            } catch {
                if (!cancelled) {
                    setValue((current) => ({ ...current, abilities: [] }))
                }
            }
        }

        const stop = session.subscribe((state, reason) =>
            setValue((current) => ({ ...current, state, endedBecause: reason, ready: true })),
        )

        void session.restore().then(async (restored) => {
            if (cancelled) {
                return
            }

            setValue((current) => ({ ...current, ready: true }))

            if (restored) {
                await read()
            }
        })

        return () => {
            cancelled = true
            stop()
        }
    }, [refreshToken])

    const refresh = useCallback(async () => {
        setRefreshToken((token) => token + 1)
    }, [])

    const contextValue = useMemo(() => ({ ...value, refresh }), [value, refresh])

    return <SessionContext.Provider value={contextValue}>{children}</SessionContext.Provider>
}
