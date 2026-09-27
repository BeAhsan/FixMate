/**
 * `@fixmate/session` — the one place that knows a session is two tokens.
 *
 * All four applications import from here. An application creates one
 * application object from a definition and renders its three components; it
 * never calls `fetch`, never reads `localStorage`, never names an account type's
 * operations, and never contains a copy of the sign-in flow or the shell.
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

export { describeSignInFailure } from './sign-in-failure'
export type { SignInFailure } from './sign-in-failure'

export {
    OPERATIONS_BY_APPLICATION,
    createApplicationClient,
    operationsFor,
} from './application-operations'
export type { ApplicationKey } from './application-operations'

export { createApplication, explanationFor, SignInForm } from './react/application'
export type {
    Application,
    ApplicationDefinition,
    SignInFormProps,
} from './react/application'

export type {
    AccountKind,
    Session,
    SessionAccount,
    SessionEndReason,
    SessionOperations,
    SessionOptions,
    SessionState,
} from './types'
