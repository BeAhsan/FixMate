'use client'

import { session, type SessionEndReason, type SessionState } from '@/lib/api'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * Restores the session once, for the whole application.
 *
 * In the root layout rather than in each page, because the access token lives in
 * memory and a reload destroys it — so *every* page has to spend the renewal
 * token on arrival, and a per-page `restore()` is a per-page chance to forget.
 * That is not hypothetical: with the restore living on the sign-in screen alone,
 * reloading the landing page left the renewal token untouched and the person
 * signed out, which is the exact failure this ticket exists to prevent.
 *
 * The state is exposed through context rather than read from the module, so a
 * component re-renders when the session changes instead of polling it.
 */

interface SessionContextValue {
    state: SessionState
    endedBecause: SessionEndReason | null
    /** False until the first restore has been attempted, so a shell can wait. */
    ready: boolean
}

const SessionContext = createContext<SessionContextValue>({
    state: 'unknown',
    endedBecause: null,
    ready: false,
})

export function useSession(): SessionContextValue {
    return useContext(SessionContext)
}

export function SessionProvider({ children }: { children: ReactNode }) {
    const [value, setValue] = useState<SessionContextValue>({
        state: session.state,
        endedBecause: session.endedBecause,
        ready: false,
    })

    useEffect(() => {
        const stop = session.subscribe((state, reason) =>
            setValue({ state, endedBecause: reason, ready: true }),
        )

        void session.restore().finally(() => {
            setValue({
                state: session.state,
                endedBecause: session.endedBecause,
                ready: true,
            })
        })

        return stop
    }, [])

    // Memoised so the context value is stable between renders. Without it every
    // render of the provider hands its children a new object and defeats the
    // point of having a context.
    const memoised = useMemo(() => value, [value])

    return <SessionContext.Provider value={memoised}>{children}</SessionContext.Provider>
}
