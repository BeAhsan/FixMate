import { createApiClient, createOperations } from '@fixmate/api-client'
import {
    createAccessTokenSource,
    createSession,
    webStorageRenewalTokenStore,
} from '@fixmate/session'
import { resolveBaseUrl } from './base-url'

/**
 * The one place in this application that knows the back end exists, and the one
 * place that knows a session exists.
 *
 * Construction order is load-bearing and is the reason the access token lives in
 * an object rather than inside the session:
 *
 *   1. `tokens` — the holder for the access token.
 *   2. `client` — reads that holder, so every request carries the credential.
 *   3. `operations` — the typed calls, bound to the client.
 *   4. `session` — writes the holder, and is given only the three operations
 *      that belong to *this* application.
 *
 * The alternative, handing the client a closure over a `session` variable that
 * does not exist yet, type-checks only with an assertion and breaks silently if
 * the order ever changes. See `createAccessTokenSource`.
 *
 * The three operations passed in are the end user's, by name and not by a
 * parameter. This application cannot reach a worker's, an administrator's or a
 * super administrator's door even by accident, and the back end would refuse it
 * if it tried.
 */
const tokens = createAccessTokenSource()

export const client = createApiClient({
    baseUrl: resolveBaseUrl(process.env.NEXT_PUBLIC_API_URL),
    getAccessToken: tokens.get,
})

const api = createOperations(client)

export const session = createSession({
    tokens,
    store: webStorageRenewalTokenStore('fixmate.user.renewal'),
    operations: {
        signIn: (input) => api.signInUser(input),
        renew: () => api.renewSessionUser(),
        signOut: () => api.signOutUser(),
    },
})

export { ApiError } from '@fixmate/api-client'
export type { ApiErrorKind } from '@fixmate/api-client'
export type { SessionEndReason, SessionState } from '@fixmate/session'
