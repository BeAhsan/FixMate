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
    /**
     * The session was ended locally after a period with nobody using the page.
     *
     * Distinct from `expired` because the two need different words. `expired` means
     * the credential ran out and the person should come back; `idle` means the
     * same thing happened deliberately, and a message about a token expiring would
     * be technically true and would not explain why a page they were looking at
     * suddenly signed them out.
     *
     * Also distinct from `signed-out`, which is the one the person asked for.
     */
    | 'idle'

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
        must_change_password: boolean
    }>
    renew(): Promise<{
        access_token: string
        renewal_token: string
        access_token_expires_at: string
        renewal_token_expires_at: string
        must_change_password: boolean
    }>
    signOut(): Promise<{ message: string }>
    /**
     * Who the live token belongs to, and what it may do.
     *
     * Part of the session rather than something an application calls separately,
     * because two things need it and neither should have to remember to: the
     * shell needs the account type to name the live identity, and the navigation
     * needs the abilities to decide what to offer. An application that had to ask
     * for them itself would be one more place to forget, and forgetting means
     * either an empty header or a navigation offering a link that will refuse.
     */
    whoAmI(): Promise<{
        account_type: string
        account: { id: number; name: string; email: string; status: string }
        abilities: string[]
    }>
    /**
     * Replace the signed-in account's password.
     *
     * Part of the session for the same reason `whoAmI` is: the account type is
     * already bound to this application's operations, so the four front ends never
     * name a change-password operation and an application cannot reach another
     * account type's door by trying.
     *
     * `current_password` is not a convenience. The access token proves who is
     * asking; the current password proves it is the person rather than a copy of
     * their session.
     */
    changePassword(input: {
        current_password: string
        password: string
    }): Promise<{
        account_type: string
        account: { id: number; name: string; email: string; status: string }
        abilities: string[]
    }>
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
    /**
     * How long a session may sit with nobody using the page before it ends, in
     * milliseconds. Zero or absent disables the rule.
     *
     * The rule exists because renewing on a timer alone does not produce one. A
     * timer fires whether or not anybody is there, so an open tab on a machine
     * nobody is sitting at keeps minting access tokens all day — which is the
     * opposite of what a person closing a laptop at a café is relying on when they
     * think they have signed out.
     *
     * **It must be shorter than the access token's own lifetime.** If it is longer,
     * the token expires first and the person watching the page sees failed
     * requests and a shell that still claims to be signed in, rather than the
     * sign-in screen this is meant to produce. The default is ten minutes against
     * a fifteen-minute token, and {@link SessionOptions.idleTimeoutMs} says so
     * where somebody changing it will read it.
     */
    idleTimeoutMs?: number
}

/**
 * Who the live session belongs to, as the back end describes it.
 *
 * `abilities` is empty when the account could not be read, which hides every
 * ability-scoped section rather than offering one that will be refused.
 */
export interface SessionAccount {
    accountType: string
    name: string
    email: string
    abilities: string[]
}

/**
 * Whether this account has to replace its password before it can be used.
 *
 * Separate from {@link SessionAccount} and held on the session itself, because it
 * survives the account being unreadable — and while the flag is set, `whoAmI` is
 * one of the routes the back end refuses. An account that has to change its
 * password is the one account this package cannot read, so anything the front end
 * needs to know about that account has to come from sign-in and renewal rather
 * than from the account itself.
 */
export type MustChangePassword = boolean

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
     * Who the live session belongs to, or null before the back end has said.
     *
     * Null rather than a guess: the account type is the back end's to decide,
     * and a session layer that filled one in would be labelling itself on trust.
     */
    account(): SessionAccount | null
    /**
     * Whether this account must replace its password, or false before the back end
     * has said.
     *
     * False rather than null while unknown, and that is a deliberate asymmetry with
     * {@link Session.account}: this one defaults to *false* because it is a
     * routing decision, and routing somebody to the change screen they do not need
     * would be the worse mistake. The back end is the control either way — a client
     * that sends an account here when it did not need to be here is making a useless
     * request, not a permitted one.
     *
     * Reported by sign-in and by renewal, which are the only two calls that can
     * succeed for a flagged account. That is the whole reason renewal is exempt from
     * the back end's guard: without it, reloading this page signs the person out and
     * tells them their account cannot be used, which is false.
     */
    mustChangePassword(): MustChangePassword
    /**
     * Replace the signed-in account's password.
     *
     * Clears {@link Session.mustChangePassword} on success, because the back end
     * cleared the flag and the two must not disagree: a session that still believed
     * it had to change its password would send the person straight back to a screen
     * they had just satisfied.
     *
     * Every *other* session the account held is withdrawn by the back end, and this
     * one is spared, so the person is not signed out of the application they are
     * standing in.
     */
    changePassword(currentPassword: string, newPassword: string): Promise<void>
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
    /**
     * Record that somebody is using the page, and push the idle deadline back.
     *
     * Called by the application on real interaction. The session layer cannot
     * listen for itself: it has no window, and what makes a browser event
     * meaningful is that a person caused it. A `mousemove` listener in here would
     * keep a session alive on a machine where a window happened to be jostled,
     * which is the opposite of the guarantee.
     *
     * Safe to call as often as the application likes, and cheap — a number
     * assignment and a reschedule.
     */
    noteActivity(): void
    /** Observe state changes. Returns the function that stops observing. */
    subscribe(listener: (state: SessionState, reason: SessionEndReason | null) => void): () => void
}
