import type { AccessTokenSource } from './access-token-source'
import type { RenewalTokenStore } from './renewal-token-store'

/**
 * The signed-in state an application sees.
 *
 * Three states rather than two, and the middle one is the point. A boolean
 * cannot distinguish "we have not looked yet" from "signed out", and an
 * application that renders a signed-out screen during that gap flashes the wrong
 * thing at somebody on every page load. `restoring` exists so a shell can hold
 * back until the answer is real.
 */
export type SessionState =
    /** Nobody has asked yet. The first render of a fresh page. */
    | 'unknown'
    /** A renewal is in flight. */
    | 'restoring'
    /** There is an access token in memory. */
    | 'signed-in'
    /** There is not, and there was a session to begin with. */
    | 'signed-out'

/**
 * Why a session ended.
 *
 * Carried on the state so a sign-in screen can say *why* it is being shown,
 * rather than appearing as though the person had never signed in. The two cases
 * a person can act on are genuinely different: one is "come back", the other is
 * "something happened to your access, contact an administrator".
 */
export type SessionEndReason =
    /** The person asked to sign out. */
    | 'signed-out'
    /** The renewal token was gone, spent or expired. */
    | 'expired'
    /** The back end refused the renewal, e.g. the account was suspended. */
    | 'refused'

/** The account type an application is, which decides which door it uses. */
export type AccountKind = 'user' | 'worker' | 'admin' | 'super-admin'

/**
 * The four calls a session needs, resolved to one account type.
 *
 * Passed in rather than switched on inside this package, so the four
 * applications each hand over their own operations and none of them can reach
 * another's door. A `switch` on account type here would be a second place where
 * "which store does this application talk to" is decided, and the back end
 * already enforces the answer — a front end that could name the wrong one would
 * be a front end whose bug is an authentication bypass.
 */
export interface SessionOperations {
    signIn(input: { email: string; password: string }): Promise<{
        token: string
        renewal_token: string
        access_token_expires_at: string
        renewal_token_expires_at: string
    }>
    renew(): Promise<{
        access_token: string
        renewal_token: string
        access_token_expires_at: string
        renewal_token_expires_at: string
    }>
    signOut(): Promise<{ message: string }>
}

export interface SessionOptions {
    operations: SessionOperations
    /**
     * Where the access token is held.
     *
     * Required rather than created internally, because the API client has to be
     * able to read the token and the client is built first. See
     * {@link createAccessTokenSource} for why that is not solved with a closure.
     */
    tokens: AccessTokenSource
    store: RenewalTokenStore
    /**
     * How long before an access token expires to renew it, in milliseconds.
     *
     * Renewing *after* expiry would mean every page load racing a 401. The
     * default is a minute, which is long enough to cover a slow round trip and
     * short enough that the token is never handed out with seconds left on it.
     */
    renewBeforeExpiryMs?: number
    /** Injectable so tests need not wait in real time. */
    now?: () => number
    /**
     * Injectable so tests need not schedule real timers.
     *
     * The task may return a promise, and a test awaits it. A real timer ignores
     * the return value, so this costs nothing at run time — but without it a
     * scheduled renewal is unobservable, because the callback fires and forgets
     * and the test that invoked it has already finished by the time the renewal
     * lands. A seam that cannot be awaited is a seam that gets asserted by
     * sleeping, which is how a flaky test is born.
     */
    schedule?: (runAt: number, task: () => void | Promise<void>) => () => void
    onError?: (error: unknown) => void
}

export interface Session {
    /** The current state, for a shell to render from. */
    readonly state: SessionState
    /** Why the last session ended, or null while there has not been one. */
    readonly endedBecause: SessionEndReason | null
    /** The access token, or null. Never persisted anywhere by this package. */
    accessToken(): string | null
    /** When the current access token stops being accepted, or null. */
    accessTokenExpiresAt(): number | null
    /**
     * Attempt to restore a session from the stored renewal token.
     *
     * Call once on load. Safe to call more than once: a restore already in
     * flight is not started again, because two concurrent renewals would spend
     * the same single-use token and lock the person out.
     */
    restore(): Promise<boolean>
    /** Sign in, and hold the resulting tokens. */
    signIn(email: string, password: string): Promise<void>
    /** End the session here and, by revoking, in the other three applications. */
    signOut(): Promise<void>
    /** Observe state changes. Returns the function that stops observing. */
    subscribe(listener: (state: SessionState, reason: SessionEndReason | null) => void): () => void
}
