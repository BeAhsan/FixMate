import { ApiError } from '@fixmate/api-client'
import type { AccessTokenSource } from './access-token-source'
import type { RenewalTokenStore } from './renewal-token-store'
import {
    type Session,
    type SessionEndReason,
    type SessionOptions,
    type SessionState,
} from './types'

/**
 * The session, shared by all four applications.
 *
 * The rule this file exists to enforce is that **the access token is only ever
 * in a variable**. It is never written to storage, never put in a cookie, and
 * never returned to anything that might keep it. It is read by the API client's
 * token getter and by nothing else, so there is no path by which it reaches
 * disk.
 *
 * Everything else follows from that. An in-memory token does not survive a page
 * load, which is the *reason* the renewal token exists rather than a shortcoming
 * of it: the moment the browser reloads, the access token is gone and the only
 * way back is to spend the renewal token for a new one. That is why the renewal
 * token is rotated on every use — it is the only credential that outlives
 * anything, so it is also the only one worth stealing.
 */
export function createSession(options: SessionOptions): Session {
    const { operations, store, tokens } = options
    const now = options.now ?? (() => Date.now())
    const renewBeforeExpiryMs = options.renewBeforeExpiryMs ?? 60_000

    const schedule =
        options.schedule ??
        ((runAt: number, task: () => void) => {
            const timer = setTimeout(task, Math.max(0, runAt - now()))

            return () => clearTimeout(timer)
        })

    let state: SessionState = 'unknown'
    let endedBecause: SessionEndReason | null = null
    let accessTokenExpiresAt: number | null = null
    let restoring: Promise<boolean> | null = null
    let cancelScheduledRenewal: (() => void) | null = null
    const listeners = new Set<(state: SessionState, reason: SessionEndReason | null) => void>()

    const heldRenewalToken = (): string | null =>
        store.kind === 'held-by-client' ? store.read() : null

    const publish = (next: SessionState, reason: SessionEndReason | null = endedBecause) => {
        state = next
        endedBecause = reason

        for (const listener of listeners) {
            listener(state, endedBecause)
        }
    }

    const cancelRenewal = () => {
        cancelScheduledRenewal?.()
        cancelScheduledRenewal = null
    }

    /**
     * Arrange for a renewal before the token expires, rather than after.
     *
     * A person mid-request must not be interrupted, and an application that
     * waited for a 401 would show them an error for a session that was working
     * perfectly. Renewing a minute early costs one request and avoids both.
     */
    const scheduleRenewal = (expiresAt: number) => {
        cancelRenewal()

        // Returned rather than `void`-ed, so a test can await the renewal. A
        // real timer ignores it; see `SessionOptions.schedule`. The result is
        // discarded either way — whether a scheduled renewal worked is not
        // something a timer callback can act on.
        cancelScheduledRenewal = schedule(expiresAt - renewBeforeExpiryMs, () =>
            renew()
                .then(() => undefined)
                .catch(() => {
                    // A failed background renewal is not an error to shout about.
                    // The access token is still valid for its remaining minute, and
                    // the next load will try again. Surfacing it would put a message
                    // in front of somebody whose session is fine.
                }),
        )
    }

    const adopt = (renewed: {
        access_token: string
        renewal_token: string
        access_token_expires_at: string
        renewal_token_expires_at: string
    }) => {
        tokens.set(renewed.access_token)
        accessTokenExpiresAt = Date.parse(renewed.access_token_expires_at)

        // The rotated token replaces the one just spent, every time. If this
        // write is skipped the next renewal presents a token the back end has
        // already deleted, and the person is signed out by a bug rather than by
        // anything they did.
        if (store.kind === 'held-by-client') {
            store.write(renewed.renewal_token)
        }

        publish('signed-in', null)
        scheduleRenewal(accessTokenExpiresAt)
    }

    /**
     * Forget everything held here, without telling the back end.
     *
     * Used when renewal fails and when signing out. The renewal token is
     * discarded either way: if it is spent or refused, keeping it would mean
     * retrying a credential that will never work.
     */
    const forget = (reason: SessionEndReason) => {
        cancelRenewal()
        tokens.set(null)
        accessTokenExpiresAt = null
        store.clear()
        publish('signed-out', reason)
    }

    const renew = async (): Promise<boolean> => {
        const token = heldRenewalToken()

        if (token === null) {
            // Not an expiry. There was no session to expire, and saying so
            // would greet a first-time visitor with "your session has ended" —
            // which is a claim about a session they never had, on the one screen
            // where being told something false is most confusing.
            //
            // This is reached on every first page load, so it is the most commonly
            // seen state in the whole application, not an edge case.
            cancelRenewal()
            tokens.set(null)
            accessTokenExpiresAt = null
            publish('signed-out', null)

            return false
        }

        try {
            // The renewal token is presented for this one call, and only this
            // one. There is no access token to present at this point — that is
            // why the renewal is happening — and leaving the renewal token
            // installed afterwards would mean every later request presented a
            // browser-stored credential, which is the mistake the whole design
            // exists to prevent.
            const renewed = await tokens.presentAs(token, () => operations.renew())
            adopt(renewed)

            return true
        } catch (error) {
            // 401 means the token was unknown, already spent or expired: all of
            // which are "your session has ended", and none of which is worth
            // distinguishing to the person. A 403 is different — the back end is
            // refusing on the account's behalf, most often because it has been
            // suspended, and that is a thing they need to be told.
            const refused = error instanceof ApiError && error.kind === 'forbidden'

            options.onError?.(error)
            forget(refused ? 'refused' : 'expired')

            return false
        }
    }

    return {
        get state() {
            return state
        },
        get endedBecause() {
            return endedBecause
        },
        accessToken: () => tokens.get(),
        accessTokenExpiresAt: () => accessTokenExpiresAt,

        restore() {
            // Not started twice. Two concurrent renewals would spend the same
            // single-use renewal token, and whichever lost the race would see a
            // 401 and sign the person out — a self-inflicted lockout from what
            // looks like a harmless double effect in React.
            if (restoring !== null) {
                return restoring
            }

            publish('restoring')

            restoring = renew().finally(() => {
                restoring = null
            })

            return restoring
        },

        async signIn(email, password) {
            const result = await operations.signIn({ email, password })

            tokens.set(result.token)
            accessTokenExpiresAt = Date.parse(result.access_token_expires_at)

            if (store.kind === 'held-by-client') {
                store.write(result.renewal_token)
            }

            publish('signed-in', null)
            scheduleRenewal(accessTokenExpiresAt)
        },

        async signOut() {
            const token = tokens.get() ?? heldRenewalToken()

            // The local state is cleared first and unconditionally. Whatever the
            // network says, this person asked to sign out and they are signed
            // out — leaving them apparently signed in because a request failed
            // would be a worse answer than the one they asked for.
            forget('signed-out')

            if (token === null) {
                return
            }

            try {
                await operations.signOut()
            } catch (error) {
                // A 401 here is the expected shape of signing out twice, and the
                // end state is identical. Anything else is worth seeing but not
                // worth undoing the sign-out over.
                options.onError?.(error)
            }
        },

        subscribe(listener) {
            listeners.add(listener)

            return () => {
                listeners.delete(listener)
            }
        },
    }
}
