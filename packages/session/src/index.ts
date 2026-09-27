/**
 * `@fixmate/session` — the one place that knows a session is two tokens.
 *
 * All four applications import from here. An application creates a session,
 * hands it its own four operations, and renders from `state`. It never calls
 * `fetch`, never reads `localStorage`, and never sees an access token except as
 * the string it passes to the API client.
 *
 * ```ts
 * const session = createSession({
 *   operations: {
 *     signIn: (input) => operations.signInUser(input),
 *     renew: () => operations.renewSessionUser(),
 *     signOut: () => operations.signOutUser(),
 *   },
 *   store: webStorageRenewalTokenStore('fixmate.user.renewal'),
 * })
 *
 * await session.restore()
 * session.accessToken()   // in memory, and nowhere else
 * ```
 */

export { createSession } from './create-session'

export { createAccessTokenSource } from './access-token-source'
export type { AccessTokenSource } from './access-token-source'

export {
    cookieRenewalTokenStore,
    memoryRenewalTokenStore,
    webStorageRenewalTokenStore,
} from './renewal-token-store'
export type {
    HeldByClientStore,
    RenewalTokenStore,
    SentAutomaticallyStore,
} from './renewal-token-store'

export type {
    AccountKind,
    Session,
    SessionEndReason,
    SessionOperations,
    SessionOptions,
    SessionState,
} from './types'
