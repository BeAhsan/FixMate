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

export { describePasswordChangeFailure, describeSignInFailure } from './sign-in-failure'
export type { PasswordChangeFailure, SignInFailure } from './sign-in-failure'

export {
    OPERATIONS_BY_APPLICATION,
    createApplicationClient,
    operationsFor,
} from './application-operations'
export type {
    ApplicationKey,
    OperationsForApplication,
} from './application-operations'

export {
    createApplication,
    destinationFor,
    explanationFor,
    SignInForm,
    ChangePasswordForm,
} from './react/application'

/**
 * The nine screens fed by the mocked customer endpoints.
 *
 * **Nine, and the count is asserted rather than described** —
 * `mocked-customer-screens.test.tsx` renders every one of them and fails if the
 * inventory there and this folder disagree. A screen added here without the
 * `MockedDataNotice` is the failure that count exists for.
 *
 * Each takes its loader as a prop rather than importing one, for the reason the
 * rest of this package is shaped the way it is: a component that built its own
 * client would need an API address at module load, so it would be unloadable and
 * untestable without one. Handed a function, each screen renders with no network
 * at all — which is what makes a component test of the loading, failed and ready
 * states possible without stubbing `fetch`.
 */
export { AiDiagnosis } from './react/customer/ai-diagnosis'
export { LiveTracking } from './react/customer/live-tracking'
export { CustomerRegistration } from './react/customer/customer-registration'
export { MockedDataNotice } from './react/customer/mocked-data-notice'
export { useMockedResource, describeResourceFailure } from './react/customer/use-mocked-resource'
export type { MockedResource } from './react/customer/use-mocked-resource'
export { BookingDetails } from './react/customer/booking-details'
export {
    CustomerBookings,
    CustomerBookingsScreen,
    BookingRows,
    BookingRow,
    hrefFor,
} from './react/customer/booking-list'
export { MatchingResults } from './react/customer/matching-results'
export { CustomerDashboard } from './react/customer/customer-dashboard'
export {
    MOCK_TRUST_BADGES,
    UNSUPPORTED_CUSTOMER_CLAIMS,
} from './react/customer/mock-data'
export type {
    Application,
    ApplicationDefinition,
    SignInFormProps,
    ChangePasswordFormProps,
} from './react/application'

export type {
    AccountKind,
    MustChangePassword,
    Session,
    SessionAccount,
    SessionEndReason,
    SessionOperations,
    SessionOptions,
    SessionState,
} from './types'
