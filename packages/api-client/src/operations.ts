import { signin as signinUser } from './generated/routes/users'
import { me as meUser } from './generated/routes/users'
import { signOut as signOutUserRoute } from './generated/routes/users'
import { renew as renewUser } from './generated/routes/users/session'
import { signin as signinWorker } from './generated/routes/workers'
import { me as meWorker } from './generated/routes/workers'
import { signOut as signOutWorkerRoute } from './generated/routes/workers'
import { renew as renewWorker } from './generated/routes/workers/session'
import { signin as signinAdmin } from './generated/routes/admins'
import { signOut as signOutAdminRoute } from './generated/routes/admins'
import { renew as renewAdmin } from './generated/routes/admins/session'
import { signin as signinSuperAdmin } from './generated/routes/super-admins'
import { signOut as signOutSuperAdminRoute } from './generated/routes/super-admins'
import { renew as renewSuperAdmin } from './generated/routes/super-admins/session'
import { forgotPassword as forgotPasswordUser, resetPassword as resetPasswordUser } from './generated/routes/users'
import { forgotPassword as forgotPasswordWorker, resetPassword as resetPasswordWorker } from './generated/routes/workers'
import {
    forgotPassword as forgotPasswordAdmin,
    me as meAdmin,
    promote as promoteAdminRoute,
    resetPassword as resetPasswordAdmin,
    show as showAdmin,
    suspend as suspendAdminRoute,
} from './generated/routes/admins'
import { index as listAccountsRoute } from './generated/routes/accounts'
import { index as listProductsRoute } from './generated/routes/products'
import {
    forgotPassword as forgotPasswordSuperAdmin,
    me as meSuperAdmin,
    resetPassword as resetPasswordSuperAdmin,
} from './generated/routes/super-admins'
import {
    diagnosis as diagnosisRoute,
    tracking as trackingRoute,
    bookings as bookingsRoute,
    discovery as discoveryRoute,
    matching as matchingRoute,
    register as registerUserRoute,
} from './generated/routes/users'
import { suggestions as diagnosisSuggestionsRoute } from './generated/routes/users/diagnosis'
import { quote as bookingQuoteRoute } from './generated/routes/users/bookings'
import { change as changePasswordUserRoute } from './generated/routes/users/password'
import { change as changePasswordWorkerRoute } from './generated/routes/workers/password'
import { change as changePasswordAdminRoute } from './generated/routes/admins/password'
import { change as changePasswordSuperAdminRoute } from './generated/routes/super-admins/password'
import { array, boolean, nullable, number, object, string, type Schema } from './schema'
import type { ApiClient, Route } from './http'

/**
 * Every operation the four applications can call, each bound to a generated
 * route function and to the shapes its request and response must have.
 *
 * The URL is not written here — it comes from the generated function, so it
 * cannot be wrong. The shapes are written here, because wayfinder does not know
 * them: it reads routes, not bodies, and generates nothing for a request or a
 * response. That split is the whole contract between the two sides.
 *
 * The shape declared below is the same one asserted by the back end's own HTTP
 * feature tests (tests/Feature/UserSignInTest.php). If the two sides disagree,
 * one of the two suites fails, and this package's own tests fail too if the
 * response stops matching at runtime.
 */

/**
 * What renewing a session resolves with: a new access token, and a new renewal
 * token to replace the one just spent.
 *
 * Both are returned on every renewal, and the rotation is the point — the token
 * that was presented is dead the moment this arrives, so a copy taken from
 * browser storage is good for exactly one exchange. A front end that keeps using
 * the old one is not "slightly behind", it is signed out, which is the intended
 * consequence rather than a bug to work around.
 */
export interface RenewedSession {
    access_token: string
    renewal_token: string
    access_token_expires_at: string
    renewal_token_expires_at: string
    /**
     * Whether this account still has to replace its password.
     *
     * Reported by renewal as well as by sign-in, and the reason is that renewal is
     * the only thing that happens on a page reload. A front end restoring a session
     * from browser storage has run no sign-in, so without this field its only
     * evidence that the account is flagged would be the 403 every other route
     * returns — and acting on that means matching on the back end's wording, which
     * is a second place where that sentence's meaning lives and changes silently
     * when somebody improves the phrasing.
     *
     * Advisory, exactly as at sign-in: `EnsurePasswordChanged` is the control, and
     * a client ignoring this field still cannot reach anything. It is here so the
     * session can be put back on the screen that helps.
     */
    must_change_password: boolean
}

/** What signing out resolves with. A sentence, because a front end shows it. */
export interface SignOutResult {
    message: string
}

export interface SignInInput {
    email: string
    password: string
}

export interface SignInAccount {
    id: number
    name: string
    email: string
}

export interface SignInResult {
    token: string
    user: SignInAccount
    abilities: string[]
    /**
     * The renewal token, and the two expiries.
     *
     * Declared and validated rather than left to the shape of whatever arrived.
     * A sign-in that returned a token and no way to renew it would leave the
     * application holding an access token that silently stops working, and the
     * symptom — a session that ends for no visible reason — is very hard to
     * trace back to a missing field.
     */
    renewal_token: string
    access_token_expires_at: string
    renewal_token_expires_at: string
    /**
     * Whether this account must replace its password before it can be used.
     *
     * A *courtesy*, not a control: it lets a front end route to the change screen
     * instead of to a dashboard that will refuse every request. `EnsurePasswordChanged`
     * is the control, and a client that ignores this field entirely still cannot
     * reach a single other endpoint.
     *
     * Declared and validated rather than left to the shape of whatever arrived. A
     * sign-in that returned no way to learn this would put a person with a shared
     * password on a dashboard that silently refuses everything, and the symptom —
     * every request failing for no visible reason — is very hard to trace back to
     * a missing field.
     */
    must_change_password: boolean
}

export interface WorkerSignInResult {
    token: string
    worker: SignInAccount
    abilities: string[]
    /**
     * The renewal token, and the two expiries.
     *
     * Declared and validated rather than left to the shape of whatever arrived.
     * A sign-in that returned a token and no way to renew it would leave the
     * application holding an access token that silently stops working, and the
     * symptom — a session that ends for no visible reason — is very hard to
     * trace back to a missing field.
     */
    renewal_token: string
    access_token_expires_at: string
    renewal_token_expires_at: string
    /**
     * Whether this account must replace its password before it can be used.
     *
     * A *courtesy*, not a control: it lets a front end route to the change screen
     * instead of to a dashboard that will refuse every request. `EnsurePasswordChanged`
     * is the control, and a client that ignores this field entirely still cannot
     * reach a single other endpoint.
     *
     * Declared and validated rather than left to the shape of whatever arrived. A
     * sign-in that returned no way to learn this would put a person with a shared
     * password on a dashboard that silently refuses everything, and the symptom —
     * every request failing for no visible reason — is very hard to trace back to
     * a missing field.
     */
    must_change_password: boolean
}

export interface AdminSignInResult {
    token: string
    admin: SignInAccount
    abilities: string[]
    /**
     * The renewal token, and the two expiries.
     *
     * Declared and validated rather than left to the shape of whatever arrived.
     * A sign-in that returned a token and no way to renew it would leave the
     * application holding an access token that silently stops working, and the
     * symptom — a session that ends for no visible reason — is very hard to
     * trace back to a missing field.
     */
    renewal_token: string
    access_token_expires_at: string
    renewal_token_expires_at: string
    /**
     * Whether this account must replace its password before it can be used.
     *
     * A *courtesy*, not a control: it lets a front end route to the change screen
     * instead of to a dashboard that will refuse every request. `EnsurePasswordChanged`
     * is the control, and a client that ignores this field entirely still cannot
     * reach a single other endpoint.
     *
     * Declared and validated rather than left to the shape of whatever arrived. A
     * sign-in that returned no way to learn this would put a person with a shared
     * password on a dashboard that silently refuses everything, and the symptom —
     * every request failing for no visible reason — is very hard to trace back to
     * a missing field.
     */
    must_change_password: boolean
}

export interface SuperAdminSignInResult {
    token: string
    super_admin: SignInAccount
    abilities: string[]
    /**
     * The renewal token, and the two expiries.
     *
     * Declared and validated rather than left to the shape of whatever arrived.
     * A sign-in that returned a token and no way to renew it would leave the
     * application holding an access token that silently stops working, and the
     * symptom — a session that ends for no visible reason — is very hard to
     * trace back to a missing field.
     */
    renewal_token: string
    access_token_expires_at: string
    renewal_token_expires_at: string
    /**
     * Whether this account must replace its password before it can be used.
     *
     * A *courtesy*, not a control: it lets a front end route to the change screen
     * instead of to a dashboard that will refuse every request. `EnsurePasswordChanged`
     * is the control, and a client that ignores this field entirely still cannot
     * reach a single other endpoint.
     *
     * Declared and validated rather than left to the shape of whatever arrived. A
     * sign-in that returned no way to learn this would put a person with a shared
     * password on a dashboard that silently refuses everything, and the symptom —
     * every request failing for no visible reason — is very hard to trace back to
     * a missing field.
     */
    must_change_password: boolean
}

/** Ask for a password reset link to be sent to an address. */
export interface ForgotPasswordInput {
    email: string
}

/** Redeem a reset link with a new password. */
export interface ResetPasswordInput {
    email: string
    token: string
    password: string
}

/** What either half of a reset answers with. */
export interface AcknowledgementResult {
    message: string
}

/**
 * The signed-in account, as the application that asked sees it.
 *
 * One shape for all four account types, unlike the sign-in responses above which
 * nest the account under a per-type key. The difference is deliberate and it is
 * the reason `account_type` is here at all: at sign-in each application already
 * knows what it is, so a key named after the store is a convenience. "Who am I"
 * is asked by a caller that may be holding the wrong token, and the answer has to
 * be able to say that the thing answering is a customer when a worker was
 * expected. A front end that cannot tell those apart renders an empty dashboard
 * instead of noticing.
 */
export interface CurrentAccount {
    account_type: string
    account: {
        id: number
        name: string
        email: string
        status: string
    }
    /**
     * The token's own claim list, echoed. Read it to decide what to offer before
     * calling anything — but the back end re-checks it on every call, so hiding a
     * button is a convenience and not the protection.
     */
    abilities: string[]
}

/**
 * One administrator, as the account-management surface describes it.
 *
 * The same four fields as {@link CurrentAccount.account}, deliberately, but a
 * separate type: this one is what a super administrator sees when looking at
 * *someone else*, and each account type is meant to see a different
 * representation of the same person. Sharing one type would make that a matter of
 * who remembered to unset a field.
 */
export interface AdminAccount {
    id: number
    name: string
    email: string
    status: string
}

/**
 * One row of the account directory: an account of any of the four types.
 *
 * `type` is the account type's own value — the same string the sign-in path and
 * the token abilities already use — so a front end switches on it rather than on a
 * display label, and a row stays interpretable when the listing mixes four types.
 *
 * One type for all four rows, and that is a simplification with a shelf life: the
 * back end builds each row from a separate summary type precisely so that a
 * staff-only field cannot leak into a worker's view, and the day one of those types
 * gains a field, this shape is the place that will need four. It is declared as one
 * type now because the four are currently identical, and the comment here is the
 * thing that will tell the next person why they stopped being.
 */
export interface AccountSummary {
    type: string
    id: number
    name: string
    email: string
    status: string
}

const signInRequest: Schema<SignInInput> = object({
    email: string(),
    password: string(),
})

/**
 * Laravel wraps an API resource in `data`, so that is the top-level key here.
 * A field that appears in the resource but not in this shape is still accepted;
 * a field this shape promises but the resource omits is a failure.
 */
const signInResponse: Schema<{ data: SignInResult }> = object({
    data: object({
        token: string(),
        user: object({
            id: number(),
            name: string(),
            email: string(),
        }),
        abilities: array(string()),
        renewal_token: string(),
        access_token_expires_at: string(),
        renewal_token_expires_at: string(),
        must_change_password: boolean(),
    }),
})

/**
 * A worker is returned under its own key, not under `user`. The back end names
 * the key after the account type so that each application reads its own, and a
 * worker application must not be handed a `user` key it would have to special-case.
 */
const workerSignInResponse: Schema<{ data: WorkerSignInResult }> = object({
    data: object({
        token: string(),
        worker: object({
            id: number(),
            name: string(),
            email: string(),
        }),
        abilities: array(string()),
        renewal_token: string(),
        access_token_expires_at: string(),
        renewal_token_expires_at: string(),
        must_change_password: boolean(),
    }),
})

/**
 * Every account type is returned under its own key, named after the account
 * type. A worker application must not be handed a `user` key it would have to
 * special-case, and the key is also what tells a front end which store it
 * actually reached — so each shape is declared separately rather than unioned,
 * and each application reads exactly one.
 *
 * These are written out rather than generated from the account type, because the
 * key is the thing a front end depends on and a computed key would type-check
 * as `string` and quietly stop asserting which store answered.
 */
const accountFields = {
    id: number(),
    name: string(),
    email: string(),
}

const adminSignInResponse: Schema<{ data: AdminSignInResult }> = object({
    data: object({
        token: string(),
        admin: object(accountFields),
        abilities: array(string()),
        renewal_token: string(),
        access_token_expires_at: string(),
        renewal_token_expires_at: string(),
        must_change_password: boolean(),
    }),
})

const superAdminSignInResponse: Schema<{ data: SuperAdminSignInResult }> = object({
    data: object({
        token: string(),
        super_admin: object(accountFields),
        abilities: array(string()),
        renewal_token: string(),
        access_token_expires_at: string(),
        renewal_token_expires_at: string(),
        must_change_password: boolean(),
    }),
})

/**
 * Asking for a reset link takes an address and nothing else.
 *
 * Which store the address is looked for in is not a field, and must never become
 * one: the back end decides it from the endpoint the front end called, so a
 * client cannot ask for a link against a store that is not its own.
 */
const forgotPasswordRequest: Schema<ForgotPasswordInput> = object({
    email: string(),
})

/**
 * Redeeming a link takes the address, the token from the link, and the new
 * password. The back end refuses a password that does not meet its policy under
 * `errors.password`, and refuses a link that is spent or expired under the
 * neutral `errors.password_reset` — the two are different failures with
 * different fixes, so they are told apart here even though neither tells a
 * caller whether an account exists.
 */
const resetPasswordRequest: Schema<ResetPasswordInput> = object({
    email: string(),
    token: string(),
    password: string(),
})

/**
 * Both halves of a reset answer with one message and nothing else.
 *
 * One shape for the acknowledgement and one for the confirmation, because a
 * front end shows either as a sentence. The acknowledgement is deliberately
 * conditional in wording: the back end sends it whether or not the address holds
 * an account, so a screen that renders it must not imply that a link is on its
 * way.
 */
const acknowledgementResponse: Schema<{ data: AcknowledgementResult }> = object({
    data: object({
        message: string(),
    }),
})

/**
 * `who am I`, as the back end declares it.
 *
 * Declared once and shared by all four doors even though there are four
 * operations, because the four responses really are one response. Four copies
 * would be four places for the shape to drift, and a drift here is invisible: the
 * field the application reads is simply `undefined` at runtime, and a dashboard
 * that renders an empty name looks like an empty account rather than a broken
 * contract.
 */
/**
 * A password change takes the current password and the new one.
 *
 * Both are required, and the current password is not a convenience. The access
 * token proves who is asking; the current password proves it is the person rather
 * than a copy of their session. Without it, anybody who found a token could set a
 * new password and lock the real owner out permanently.
 */
const changePasswordRequest: Schema<{ current_password: string; password: string }> = object({
    current_password: string(),
    password: string(),
})

const currentAccountResponse: Schema<{ data: CurrentAccount }> = object({
    data: object({
        account_type: string(),
        account: object({
            id: number(),
            name: string(),
            email: string(),
            status: string(),
        }),
        abilities: array(string()),
    }),
})

const adminAccountResponse: Schema<{ data: AdminAccount }> = object({
    data: object({
        id: number(),
        name: string(),
        email: string(),
        status: string(),
    }),
})

/**
 * One row of the account directory.
 *
 * `type` is on every row and is the account type's own value — the same string the
 * sign-in path and the token abilities use. A front end switches on that rather
 * than on a label, so a row is self-describing: the listing mixes four account
 * types and would otherwise be uninterpretable.
 *
 * Four separate shapes, one per account type, is what the back end returns and what
 * it means for one type's view not to grow another's fields. Declaring one
 * `accountSummary` type here would model all four rows identically, which is
 * currently true and is exactly the thing that stops being true the first time a
 * staff-only field is added to one of them — and a type that cannot express the
 * difference cannot warn you when it appears.
 */
const accountSummary: Schema<{
    type: string
    id: number
    name: string
    email: string
    status: string
}> = object({
    type: string(),
    id: number(),
    name: string(),
    email: string(),
    status: string(),
})

const accountDirectoryResponse: Schema<{ data: AccountSummary[] }> = object({
    data: array(accountSummary),
})

/**
 * One product in the catalogue.
 *
 * `price` is a `number` and not a string, and that is the whole reason this
 * operation exists in this shape. The back end stores the price as a fixed-scale
 * decimal, reads it back as a string, and converts it to a number in exactly one
 * place — the API resource — because this side formats the value directly and
 * will not coerce a string first. Declaring `string()` here would not catch the
 * mistake: it would make the two sides agree on the wrong type, and the failure
 * would move out of a test and into a rendered price.
 */
export interface Product {
    id: number
    name: string
    price: number
}

/**
 * The catalogue, always as an array.
 *
 * An empty catalogue is a 200 with `{"data": []}` — not a 404 and not a null — so
 * a caller receives `[]` and renders a list, rather than receiving nothing and
 * having to decide whether that is a failure. `client.request` unwraps the
 * `data` envelope, which is why this operation resolves with the array itself.
 */
const productListResponse: Schema<{ data: Product[] }> = object({
    data: array(
        object({
            id: number(),
            name: string(),
            price: number(),
        }),
    ),
})

/**
 * A promotion returns the new account and a warning.
 *
 * `warning` is nullable and never absent. A field that appears and disappears is a
 * field four front ends each have to branch on, and one of them will branch on it
 * wrongly; a field that is always present and is sometimes null is one check.
 *
 * The sentence is written by the back end, which is the only place that knows what
 * the threshold is. Parsing the count out of it here to re-decide whether to warn
 * would be a second threshold in a second language, and the two would disagree
 * quietly. Show what it says.
 */
const promotedAccountResponse: Schema<{ data: { account: AccountSummary; warning: string | null } }> =
    object({
        data: object({
            account: accountSummary,
            warning: nullable(string()),
        }),
    })

/**
 * A renewal takes no body.
 *
 * The renewal token is the credential, and it travels in the `Authorization`
 * header like any other — the fetch wrapper attaches it. There is deliberately
 * no field for it here: a body field would be a second way to present the same
 * credential, and one of the two would be a place a token could end up in a
 * request log.
 */
const renewedSessionResponse: Schema<{ data: RenewedSession }> = object({
    data: object({
        access_token: string(),
        renewal_token: string(),
        access_token_expires_at: string(),
        renewal_token_expires_at: string(),
        must_change_password: boolean(),
    }),
})

const signOutResponse: Schema<{ data: SignOutResult }> = object({
    data: object({
        message: string(),
    }),
})

/**
 * A rupee range, as two integers and a currency code.
 *
 * No symbol and no decimals, because nothing here is computed and a formatted
 * string cannot be formatted a second time at the point of display. The currency
 * is `INR` in every one of these payloads rather than a formatted `₹…`, so a
 * caller formats the number and the symbol lives in one place in the front end
 * rather than in four payloads and four format strings.
 */
export interface MoneyRange {
    min: number
    max: number
    currency: string
}

const moneyRange: Schema<MoneyRange> = object({
    min: number(),
    max: number(),
    currency: string(),
})

/**
 * The mocked AI diagnosis for a described problem.
 *
 * **Every field is a literal in `DiagnosisController`.** Nothing here is derived
 * from a description: the controller takes no input, so no model, estimator or
 * classifier runs behind this. The screen it feeds is written against the shape,
 * and the shape is the thing being built — so these types describe a fixture, not
 * a capability, and a screen that presents `confidence` as a probability is
 * presenting a number nobody computed.
 */
export interface Diagnosis {
    problem: string
    severity: string
    possible_causes: string[]
    recommended_solution: string
    estimated_time: string
    price_estimate: MoneyRange
    tools_needed: string[]
}

/** The diagnosis, wrapped — the back end answers `{ "diagnosis": { … } }`. */
export interface DiagnosisResult {
    diagnosis: Diagnosis
}

const diagnosisResult: Schema<DiagnosisResult> = object({
    diagnosis: object({
        problem: string(),
        severity: string(),
        possible_causes: array(string()),
        recommended_solution: string(),
        estimated_time: string(),
        price_estimate: moneyRange,
        tools_needed: array(string()),
    }),
})

/**
 * One of the categories a mocked diagnosis can be, and the response as a whole.
 *
 * `recommended` names a `suggestions[].id` rather than implying one by position,
 * so a client cannot read the wrong entry after the list is reordered. It is
 * still a choice made in the controller rather than a ranking: there is no score
 * behind `confidence` either.
 */
export interface DiagnosisSuggestion {
    id: string
    title: string
    description: string
    confidence: number
    price_range: MoneyRange
}

export interface DiagnosisSuggestions {
    suggestions: DiagnosisSuggestion[]
    recommended: string
}

const diagnosisSuggestions: Schema<DiagnosisSuggestions> = object({
    suggestions: array(
        object({
            id: string(),
            title: string(),
            description: string(),
            confidence: number(),
            price_range: moneyRange,
        }),
    ),
    recommended: string(),
})

/**
 * The mocked live position of a technician travelling to a booking.
 *
 * **`location`, `distance_km` and `eta_minutes` describe a journey that is not
 * happening.** The coordinates are two fixed points, the distance and the ETA are
 * literals, and nothing polls this endpoint or moves anything between calls — so a
 * screen that draws a map from these numbers draws a technician standing still in
 * one place forever. They are typed and validated anyway, because the screen has
 * to be built against something, and a shape that is honest about being a fixture
 * is cheaper to replace than a guess at what the real one will send.
 *
 * `stages` repeats each stage with its own `completed` flag rather than leaving
 * a client to derive it from a single index, so a future stage carries a null
 * `timestamp` and the two cannot disagree inside one payload.
 */
export interface TrackingWorker {
    id: string
    name: string
    phone: string | null
    rating: number
    photo_url: string | null
}

export interface TrackingLocation {
    worker_lat: number
    worker_lng: number
    destination_lat: number
    destination_lng: number
    distance_km: number
    eta_minutes: number
}

export interface TrackingStage {
    name: string
    completed: boolean
    timestamp: string | null
}

export interface LiveTracking {
    booking_id: string
    status: string
    service: string
    worker: TrackingWorker
    location: TrackingLocation
    stages: TrackingStage[]
}

const liveTracking: Schema<LiveTracking> = object({
    booking_id: string(),
    status: string(),
    service: string(),
    worker: object({
        id: string(),
        name: string(),
        phone: nullable(string()),
        rating: number(),
        photo_url: nullable(string()),
    }),
    location: object({
        worker_lat: number(),
        worker_lng: number(),
        destination_lat: number(),
        destination_lng: number(),
        distance_km: number(),
        eta_minutes: number(),
    }),
    stages: array(
        object({
            name: string(),
            completed: boolean(),
            timestamp: nullable(string()),
        }),
    ),
})

/**
 * One mocked booking, and the list of them.
 *
 * **Nothing in the list belongs to the account whose token presented it.** Two
 * fixed bookings come back for every customer, with timestamps relative to the
 * moment of the request. A screen that renders this looks correct to whoever
 * wrote it and is wrong to everybody, which is why the field the real response
 * will hinge on — whose booking this is — is the one thing absent from it.
 *
 * `bookings` is always an array with no pagination envelope, so a caller renders
 * a list in both the populated and the empty case.
 *
 * ## The three fields beside the machine ones
 *
 * `status`, `scheduled_at` and whether a detail page exists are all facts about
 * the booking, and all three would otherwise be a decision handed to whichever
 * screen renders this list. `status_label`, `scheduled_on` and `has_quote` carry
 * them as values, so a caller can still branch on `status` and nobody has to
 * rebuild a phrase from an underscore.
 *
 * **`has_quote` is required, and a missing one is a schema failure rather than a
 * default of `false`.** A screen cannot tell "this booking has no quote" from
 * "this payload predates the field", and defaulting would make the second one
 * render as the first — a row that cannot be opened, for no reason a reader could
 * see. The same reason `phone` and `photo_url` are nullable rather than optional
 * in the tracking payload.
 */
export interface Booking {
    id: string
    service: string
    status: string
    status_label: string
    worker_name: string
    scheduled_at: string
    scheduled_on: string
    price: number
    currency: string
    has_quote: boolean
}

export interface BookingList {
    bookings: Booking[]
}

const bookingList: Schema<BookingList> = object({
    bookings: array(
        object({
            id: string(),
            service: string(),
            status: string(),
            status_label: string(),
            worker_name: string(),
            scheduled_at: string(),
            scheduled_on: string(),
            price: number(),
            currency: string(),
            has_quote: boolean(),
        }),
    ),
})

/**
 * What a registration attempt echoes back.
 *
 * **It creates no account, and `token` is not a credential.** There is no
 * registration in this platform — accounts exist because an operator ran
 * `fixmate:create-account`, and that command is the only way one is made. The
 * password in `RegistrationInput` is accepted and ignored rather than echoed, so
 * no credential is put in a response where a proxy could log it or a screen could
 * display it.
 *
 * `user` carries only the two fields the design's success state shows. A phone
 * number is absent because the registration frame has no phone field to echo one
 * from.
 */
export interface RegistrationInput {
    name: string
    email: string
    password: string
}

export interface RegistrationAccount {
    id: number
    name: string
    email: string
}

export interface RegistrationResult {
    success: boolean
    message: string
    user: RegistrationAccount
    token: string
}

const registrationRequest: Schema<RegistrationInput> = object({
    name: string(),
    email: string(),
    password: string(),
})

const registrationResponse: Schema<RegistrationResult> = object({
    success: boolean(),
    message: string(),
    user: object({
        id: number(),
        name: string(),
        email: string(),
    }),
    token: string(),
})

/**
 * A service category the customer can browse.
 *
 * `price_from` is an integer in `currency` and **not a formatted string.** Four
 * front ends draw prices, and a server that pre-rendered one would be choosing a
 * locale and a separator for all four. Nothing here computed it — there is no
 * pricing table in this repository — so a screen must not present it as an offer.
 */
export interface ServiceCategory {
    id: string
    label: string
    price_from: number
    currency: string
}

/**
 * One technician in the dashboard's carousel.
 *
 * **`completed_jobs` is a count and not the review count**, even though the shared
 * fixture happens to carry the same number for both. A carousel says "120 jobs"
 * and a match card says "(120)" beside a star, and those are different claims
 * about a person: one is volume, the other is how many people rated him. Naming
 * them the same field would have made a later fixture able to say a technician
 * has done 240 jobs and been rated by 12 people without anything looking wrong.
 */
export interface FeaturedTechnician {
    id: string
    name: string
    trade: string
    rating: number
    completed_jobs: number
}

export interface Discovery {
    categories: ServiceCategory[]
    featured_technicians: FeaturedTechnician[]
}

const discovery: Schema<Discovery> = object({
    categories: array(
        object({
            id: string(),
            label: string(),
            price_from: number(),
            currency: string(),
        }),
    ),
    featured_technicians: array(
        object({
            id: string(),
            name: string(),
            trade: string(),
            rating: number(),
            completed_jobs: number(),
        }),
    ),
})

/**
 * When a technician could start.
 *
 * `label` and `available_now` are both sent and both are needed. The label is what
 * the card prints and the flag is what decides whether its button offers to book
 * — a screen given only the flag would have to invent "Available Now", and one
 * given only the label would have to compare English strings to decide whether
 * somebody can be booked.
 */
export interface TechnicianAvailability {
    label: string
    available_now: boolean
}

/**
 * One match result.
 *
 * **`trade` and `years_experience` are separate and the screen joins them.** The
 * design prints "Master Plumber • 12 yrs exp" — one line, two facts, and a
 * separator that is a rendering decision. Sending the joined string would put the
 * bullet character and the abbreviation in a controller, where four front ends
 * would each want to spell them their own way.
 */
export interface MatchResult {
    id: string
    name: string
    trade: string
    years_experience: number
    base_fee: number
    currency: string
    rating: number
    review_count: number
    distance_km: number
    availability: TechnicianAvailability
    best_match: boolean
}

/**
 * A sort the design offers and this endpoint does not perform.
 *
 * Sent with an identifier and a label and **no behaviour whatsoever** — nothing
 * reads it and nothing changes the order of `technicians`. It is sent rather than
 * left in the screen so that its inertness is visible in one place: a server is
 * offering to sort these results, and the list arrives in the order the fixture
 * was written.
 */
export interface MatchFilter {
    id: string
    label: string
}

export interface Matching {
    query: string
    area: string
    found_count: number
    summary: string
    average_arrival_minutes: number
    estimated_cost: MoneyRange
    filters: MatchFilter[]
    technicians: MatchResult[]
}

const matching: Schema<Matching> = object({
    query: string(),
    area: string(),
    found_count: number(),
    summary: string(),
    average_arrival_minutes: number(),
    estimated_cost: moneyRange,
    filters: array(
        object({
            id: string(),
            label: string(),
        }),
    ),
    technicians: array(
        object({
            id: string(),
            name: string(),
            trade: string(),
            years_experience: number(),
            base_fee: number(),
            currency: string(),
            rating: number(),
            review_count: number(),
            distance_km: number(),
            availability: object({
                label: string(),
                available_now: boolean(),
            }),
            best_match: boolean(),
        }),
    ),
})

/**
 * A day the technician could come.
 *
 * `is_today` is a flag and the screen renders the word "TODAY" from it. A stored
 * "TODAY" would be asserting that a day captured at some point in the past is
 * still today — and these front ends are static exports, served unchanged from
 * whenever they were built.
 */
export interface BookingDay {
    date: string
    weekday: string
    day_label: string
    is_today: boolean
}

export interface BookingSlot {
    starts_at: string
    label: string
}

export interface EstimateLine {
    label: string
    amount: number
}

/**
 * A price broken into its parts.
 *
 * **Nothing computed any of it.** There is no pricing table, no rate card, no
 * labour rate and no platform fee in this repository, so these three lines are the
 * shape of a quote rather than a quote. `total` is stated separately rather than
 * left for a caller to add up, because a screen that summed the lines and
 * disagreed with a total it was also sent would have no way to know which of the
 * two was wrong.
 */
export interface BookingEstimate {
    heading: string
    badge: string
    lines: EstimateLine[]
    total: number
    total_label: string
    currency: string
    footnote: string
}

/**
 * The technician booked for a quote.
 *
 * **Its own type rather than {@link TrackingWorker}, and the difference is
 * load-bearing.** `TrackingWorker` carries `phone` and `photo_url` as nullable
 * because the tracker has to show a call button that works for somebody who has
 * put a number in and must not for somebody who has not. The quote has no such
 * problem: it draws a card with a name, a trade and a rating, and there is no
 * field on the design it would be drawn into.
 *
 * Reusing the tracking type would have meant the quote's schema carrying two
 * fields the controller does not send, so the schema would have to say
 * `nullable` and the screen would be handed two `null`s it had no use for — and
 * the first person to draw a phone icon onto this card would have had a type
 * telling them the value was there. It is `null` because the endpoint omits it,
 * and the type says so.
 */
export interface BookingTechnician {
    id: string
    name: string
    trade: string
    rating: number
    review_count: number
}

/**
 * A way of paying that this repository cannot take.
 *
 * There is no gateway, no checkout, no order and no payment intent anywhere. A
 * screen drawing these is drawing radio inputs that select local state.
 */
export interface PaymentMethod {
    id: string
    title: string
    note: string
}

export interface BookingQuote {
    booking_id: string
    category: string
    service: string
    technician: BookingTechnician
    dates: BookingDay[]
    times: BookingSlot[]
    estimate: BookingEstimate
    payment_methods: PaymentMethod[]
}

const bookingQuote: Schema<BookingQuote> = object({
    booking_id: string(),
    category: string(),
    service: string(),
    technician: object({
        id: string(),
        name: string(),
        trade: string(),
        rating: number(),
        review_count: number(),
    }),
    dates: array(
        object({
            date: string(),
            weekday: string(),
            day_label: string(),
            is_today: boolean(),
        }),
    ),
    times: array(
        object({
            starts_at: string(),
            label: string(),
        }),
    ),
    estimate: object({
        heading: string(),
        badge: string(),
        lines: array(
            object({
                label: string(),
                amount: number(),
            }),
        ),
        total: number(),
        total_label: string(),
        currency: string(),
        footnote: string(),
    }),
    payment_methods: array(
        object({
            id: string(),
            title: string(),
            note: string(),
        }),
    ),
})

const definitions = {
    signInUser: {
        // Calling the generated function yields its URL and verb. The URL is
        // never written by hand, so it cannot drift from the back end's route.
        route: signinUser() satisfies Route,
        request: signInRequest,
        response: signInResponse,
    },
    signInWorker: {
        route: signinWorker() satisfies Route,
        request: signInRequest,
        response: workerSignInResponse,
    },
    signInAdmin: {
        route: signinAdmin() satisfies Route,
        request: signInRequest,
        response: adminSignInResponse,
    },
    signInSuperAdmin: {
        route: signinSuperAdmin() satisfies Route,
        request: signInRequest,
        response: superAdminSignInResponse,
    },
    forgotPasswordUser: {
        route: forgotPasswordUser() satisfies Route,
        request: forgotPasswordRequest,
        response: acknowledgementResponse,
    },
    resetPasswordUser: {
        route: resetPasswordUser() satisfies Route,
        request: resetPasswordRequest,
        response: acknowledgementResponse,
    },
    forgotPasswordWorker: {
        route: forgotPasswordWorker() satisfies Route,
        request: forgotPasswordRequest,
        response: acknowledgementResponse,
    },
    resetPasswordWorker: {
        route: resetPasswordWorker() satisfies Route,
        request: resetPasswordRequest,
        response: acknowledgementResponse,
    },
    forgotPasswordAdmin: {
        route: forgotPasswordAdmin() satisfies Route,
        request: forgotPasswordRequest,
        response: acknowledgementResponse,
    },
    resetPasswordAdmin: {
        route: resetPasswordAdmin() satisfies Route,
        request: resetPasswordRequest,
        response: acknowledgementResponse,
    },
    forgotPasswordSuperAdmin: {
        route: forgotPasswordSuperAdmin() satisfies Route,
        request: forgotPasswordRequest,
        response: acknowledgementResponse,
    },
    resetPasswordSuperAdmin: {
        route: resetPasswordSuperAdmin() satisfies Route,
        request: resetPasswordRequest,
        response: acknowledgementResponse,
    },

    // The authenticated operations, and the first in this file with no `request`.
    // A GET that takes nothing sends no body, so declaring a request shape for it
    // would be a fiction that a later editor could "fix" by adding a field to.
    currentUser: {
        route: meUser() satisfies Route,
        response: currentAccountResponse,
    },
    currentWorker: {
        route: meWorker() satisfies Route,
        response: currentAccountResponse,
    },
    currentAdmin: {
        route: meAdmin() satisfies Route,
        response: currentAccountResponse,
    },
    currentSuperAdmin: {
        route: meSuperAdmin() satisfies Route,
        response: currentAccountResponse,
    },
    showAdmin: {
        // A route with a parameter in it cannot be resolved once when this object
        // is built, so the function is what is stored and it is called per
        // request. The alternative — resolving it here with a placeholder
        // identifier — would put a URL with a made-up id in the contract, and a
        // placeholder that was ever sent would read somebody else's record or
        // 404 depending on the day.
        route: (admin: number) => showAdmin({ admin }) satisfies Route,
        response: adminAccountResponse,
    },

    // The account directory, and the two operations that change an account. All
    // three are super-administrator-only and none of them exists for the four
    // applications to call yet: the dashboards are shells, so nothing imports
    // these. They are declared because the contract declares them, and a client
    // that is missing an operation the back end offers cannot be checked against
    // it - the drift check compares the two lists, and an operation on one side
    // only is a failure in both directions.

    listAccounts: {
        route: () => listAccountsRoute() satisfies Route,
        response: accountDirectoryResponse,
    },

    // The public catalogue. Not super-administrator-only and not hidden from the
    // applications: it is the one endpoint on this API that any of them can call
    // without a token, which is a deliberate property of the route and not an
    // omission, so nothing below carries a credential.
    //
    // The route takes no parameter, so it is resolved once here rather than being
    // stored as a function the way `listAccounts` is.
    listProducts: {
        route: listProductsRoute() satisfies Route,
        response: productListResponse,
    },

    suspendAdmin: {
        // Takes no body. The only question is whether, and the path already answers
        // it; a body would be somewhere for a caller to put a status of their own
        // choosing, and the back end ignores it.
        route: (admin: number) => suspendAdminRoute({ admin }) satisfies Route,
        response: adminAccountResponse,
    },

    promoteAdmin: {
        route: (admin: number) => promoteAdminRoute({ admin }) satisfies Route,
        response: promotedAccountResponse,
    },

    /**
     * Replace the signed-in account's password, and set every other session it had
     * to nothing.
     *
     * One operation, four doors: `type` is the account type's own value, and each
     * application passes its own. A token presented at another type's door is
     * refused by the back end, which is what keeps this from being a way for an
     * end user to reach the administrators' address.
     *
     * The response is the current account rather than an acknowledgement, because
     * the front end has just invalidated every other session this account had and
     * needs to know who it is still signed in as in order to render what comes
     * next. It does not have to make a second request to find out whether the
     * change worked.
     */
    // Four of them, for the same reason the `me` operations are four: each
    // application calls its own door, and the back end refuses a token presented at
    // the wrong one. Four operations rather than one taking a type, because the
    // account type is then a literal in the path *and* in the guard, and cannot drift
    // apart between them.
    changePasswordUser: {
        // Resolved once, like `listProducts` and unlike `showAdmin`: this route takes
        // no parameter, so there is nothing to defer. The four were written as
        // `() => change()` and were never bound, which is why nothing type-checked
        // against them — a function is not a `Route`, and the call that would have
        // caught it was the binding that did not exist.
        route: changePasswordUserRoute() satisfies Route,
        body: changePasswordRequest,
        response: currentAccountResponse,
    },

    changePasswordWorker: {
        // Resolved once, like `listProducts` and unlike `showAdmin`: this route takes
        // no parameter, so there is nothing to defer. The four were written as
        // `() => change()` and were never bound, which is why nothing type-checked
        // against them — a function is not a `Route`, and the call that would have
        // caught it was the binding that did not exist.
        route: changePasswordWorkerRoute() satisfies Route,
        body: changePasswordRequest,
        response: currentAccountResponse,
    },

    changePasswordAdmin: {
        // Resolved once, like `listProducts` and unlike `showAdmin`: this route takes
        // no parameter, so there is nothing to defer. The four were written as
        // `() => change()` and were never bound, which is why nothing type-checked
        // against them — a function is not a `Route`, and the call that would have
        // caught it was the binding that did not exist.
        route: changePasswordAdminRoute() satisfies Route,
        body: changePasswordRequest,
        response: currentAccountResponse,
    },

    changePasswordSuperAdmin: {
        // Resolved once, like `listProducts` and unlike `showAdmin`: this route takes
        // no parameter, so there is nothing to defer. The four were written as
        // `() => change()` and were never bound, which is why nothing type-checked
        // against them — a function is not a `Route`, and the call that would have
        // caught it was the binding that did not exist.
        route: changePasswordSuperAdminRoute() satisfies Route,
        body: changePasswordRequest,
        response: currentAccountResponse,
    },

    // The session operations. Four of each, for the same reason the `me`
    // operations are four: each application calls its own door, and the back end
    // refuses a token presented at the wrong one.
    //
    // Renewal and sign-out take no body — the credential is in the header, put
    // there by the fetch wrapper — so they declare a response and nothing else.
    renewSessionUser: {
        route: renewUser() satisfies Route,
        response: renewedSessionResponse,
    },
    renewSessionWorker: {
        route: renewWorker() satisfies Route,
        response: renewedSessionResponse,
    },
    renewSessionAdmin: {
        route: renewAdmin() satisfies Route,
        response: renewedSessionResponse,
    },
    renewSessionSuperAdmin: {
        route: renewSuperAdmin() satisfies Route,
        response: renewedSessionResponse,
    },
    signOutUser: {
        route: signOutUserRoute() satisfies Route,
        response: signOutResponse,
    },
    signOutWorker: {
        route: signOutWorkerRoute() satisfies Route,
        response: signOutResponse,
    },
    signOutAdmin: {
        route: signOutAdminRoute() satisfies Route,
        response: signOutResponse,
    },
    signOutSuperAdmin: {
        route: signOutSuperAdminRoute() satisfies Route,
        response: signOutResponse,
    },
    // The five mocked customer operations behind the customer door.
    //
    // Every one of them answers a literal. The routes exist so the designed
    // screens have a typed shape to be written and reviewed against, and the
    // shapes are validated here so a screen breaks on a contract change rather
    // than rendering `undefined` into a price or an ETA. What they are *not* is a
    // capability: nothing behind `getDiagnosis` classifies anything, and the
    // coordinates behind `getTracking` never move. Each response type says so at
    // the definition, because the alternative is a reader who sees a validated
    // `confidence` and a validated `eta_minutes` and believes both.
    //
    // None of them use the `data` envelope the rest of the API uses, and that is
    // a difference worth noticing rather than smoothing over: `client.request`
    // hands back the whole parsed payload, and these operations return that
    // payload directly instead of destructuring `data` out of it. Giving them an
    // envelope would mean inventing a second convention in order to match the
    // first, and nothing about these five warrants a new rule.
    getDiagnosis: {
        route: diagnosisRoute() satisfies Route,
        response: diagnosisResult,
    },
    getDiagnosisSuggestions: {
        route: diagnosisSuggestionsRoute() satisfies Route,
        response: diagnosisSuggestions,
    },
    getTracking: {
        route: trackingRoute() satisfies Route,
        response: liveTracking,
    },
    listBookings: {
        route: bookingsRoute() satisfies Route,
        response: bookingList,
    },
    getDiscovery: {
        route: discoveryRoute() satisfies Route,
        response: discovery,
    },
    getMatching: {
        route: matchingRoute() satisfies Route,
        response: matching,
    },
    getBookingQuote: {
        // A function for the same reason as `showAdmin` above: the identifier is
        // not known when this object is built. Resolving it here with a
        // placeholder would put a made-up booking's URL in the contract.
        route: (booking: string) => bookingQuoteRoute(booking) satisfies Route,
        response: bookingQuote,
    },
    registerUser: {
        route: registerUserRoute() satisfies Route,
        body: registrationRequest,
        response: registrationResponse,
    },
} as const

export type OperationName = keyof typeof definitions

export interface Operations {
    /**
     * Sign in as an end user.
     *
     * Rejects with an ApiError of kind `validation` when the credentials are
     * refused, `rateLimited` when the endpoint is throttled, and `network` when
     * the back end was never reached. The back end returns the same response for
     * an unknown address, a wrong password and a suspended account, so nothing
     * here can tell those three apart either.
     */
    signInUser(input: SignInInput): Promise<SignInResult>

    /**
     * Sign in as a worker.
     *
     * Rejects with the same kinds of ApiError as the end user path, for the
     * same reasons. The two endpoints are separate and resolve against separate
     * credential stores, so this operation can only ever succeed for an account
     * that exists in the workers table.
     */
    signInWorker(input: SignInInput): Promise<WorkerSignInResult>

    /** Sign in as an administrator. */
    signInAdmin(input: SignInInput): Promise<AdminSignInResult>

    /**
     * Sign in as a super administrator.
     *
     * A separate door from the administrator one, backed by a separate store.
     * The distinction is enforced on the back end; this operation exists so the
     * super administrator application has one, and it can only ever succeed for
     * an account in the super admins table.
     */
    signInSuperAdmin(input: SignInInput): Promise<SuperAdminSignInResult>

    /**
     * Ask for a password reset link for the customer application.
     *
     * Resolves with the same acknowledgement whatever the back end makes of the
     * address, so a screen that renders it is showing a conditional statement
     * and must not present it as "we have emailed you". It is the only thing the
     * caller learns, and that is the point: a reset endpoint that reported an
     * unknown address would be a way of asking which addresses hold accounts.
     */
    forgotPasswordUser(input: ForgotPasswordInput): Promise<AcknowledgementResult>

    /**
     * Redeem a customer reset link.
     *
     * Rejects with a `validation` ApiError whose `fields` hold `password` when
     * the new password does not meet the back end's policy, or `password_reset`
     * when the link has been spent or has expired. The link is single use and it
     * is checked before the password is, so a refused password leaves it usable.
     */
    resetPasswordUser(input: ResetPasswordInput): Promise<AcknowledgementResult>

    /** Ask for a password reset link for the worker application. */
    forgotPasswordWorker(input: ForgotPasswordInput): Promise<AcknowledgementResult>

    /**
     * Redeem a worker reset link.
     *
     * A separate operation from the customer one rather than a shared one with a
     * parameter: the store a reset changes is decided by the endpoint, and a
     * front end that could name the store would be able to ask for a link
     * against an account that is not its own.
     */
    resetPasswordWorker(input: ResetPasswordInput): Promise<AcknowledgementResult>

    /** Ask for a password reset link for the administrator application. */
    forgotPasswordAdmin(input: ForgotPasswordInput): Promise<AcknowledgementResult>

    /** Redeem an administrator reset link. */
    resetPasswordAdmin(input: ResetPasswordInput): Promise<AcknowledgementResult>

    /** Ask for a password reset link for the super administrator application. */
    forgotPasswordSuperAdmin(input: ForgotPasswordInput): Promise<AcknowledgementResult>

    /** Redeem a super administrator reset link. */
    resetPasswordSuperAdmin(input: ResetPasswordInput): Promise<AcknowledgementResult>

    /**
     * Ask who the customer application's token belongs to.
     *
     * The four `current*` operations exist as four rather than one so that each
     * application calls its own door, which is what makes "a worker token does
     * not open the customer application" a fact the client can rely on instead of
     * a convention it should not have to check.
     *
     * Rejects with a `forbidden` ApiError when the token belongs to another
     * account type, and the message names both — a person who signed in at the
     * wrong door is told which door, not that their password was wrong. Rejects
     * with `unauthenticated` when there is no valid token at all, and with
     * `forbidden` when the account has been suspended since the token was issued,
     * which is why this is worth calling at start-up rather than trusting a token
     * handed over from storage.
     */
    currentUser(): Promise<CurrentAccount>

    /** Ask who the worker application's token belongs to. */
    currentWorker(): Promise<CurrentAccount>

    /** Ask who the administrator application's token belongs to. */
    currentAdmin(): Promise<CurrentAccount>

    /** Ask who the super administrator application's token belongs to. */
    currentSuperAdmin(): Promise<CurrentAccount>

    /**
     * Read one administrator's record.
     *
     * A super administrator operation: the token must carry `accounts:read`, and
     * an administrator is refused here with a `forbidden` ApiError whether or not
     * the identifier exists. That last part is the back end's doing and not
     * something to be defensive about — a 404 for a record you may not see would
     * make this endpoint a way of discovering which administrator accounts exist,
     * so a caller that gets a `notFound` can be sure it is allowed to ask.
     *
     * Rejects with `notFound` only for a permitted caller naming an identifier
     * that does not exist.
     */
    showAdmin(admin: number): Promise<AdminAccount>

    /**
     * Every account in the platform, across all four account types.
     *
     * A super administrator operation: the token must carry `accounts:read`, and
     * an end user, a worker and an administrator are all refused with a
     * `forbidden` ApiError whether or not any account exists. There is no
     * identifier to probe, so there is nothing here a caller can enumerate.
     *
     * Resolves with an empty array when the platform has no accounts — the back
     * end answers 200 with `{"data": []}` and never 404 — so a caller renders a
     * list either way and never has to treat "no accounts yet" as an error.
     *
     * The rows arrive grouped by account type, then by identifier within each
     * type. That order is the back end's choice, kept so a person comparing two
     * moments sees rows in the same places; a caller that re-sorts it is spending
     * a property it was given for free.
     */
    listAccounts(): Promise<AccountSummary[]>

    /**
     * Exchange a renewal token for a new access token and a new renewal token.
     *
     * The caller's existing renewal token is spent by this call. That is the
     * whole design: a renewal token lives in browser storage, where injected
     * script can read it, so it is given exactly one use and a short life. A
     * caller that retries with the same token gets a 401 and should treat that
     * as signed out rather than as a transient failure — the token is not coming
     * back, and retrying is how a front end ends up in a loop.
     *
     * Rejects with `unauthenticated` when the renewal token is unknown, already
     * spent or expired, and with `forbidden` when it belongs to another account
     * type or the account has been suspended since it was issued. The suspended
     * case is why a renewal is worth attempting on load rather than trusting a
     * token found in storage.
     */
    renewSessionUser(): Promise<RenewedSession>

    /** As {@link renewSessionUser}, at the worker's door. */
    renewSessionWorker(): Promise<RenewedSession>

    /** As {@link renewSessionUser}, at the administrator's door. */
    renewSessionAdmin(): Promise<RenewedSession>

    /** As {@link renewSessionUser}, at the super administrator's door. */
    renewSessionSuperAdmin(): Promise<RenewedSession>

    /**
     * End every session this account has, in all four applications.
     *
     * Revocation is server-side, so a front end cannot rely on this alone to
     * clear the other three: what it guarantees is that the access tokens they
     * are holding stop being accepted, and that the renewal token which brought
     * this session back is destroyed so a reload cannot undo the sign-out. The
     * caller should still discard its own copy of both.
     *
     * Rejects with `unauthenticated` when the token has already been revoked —
     * which includes signing out a second time. **Treat that as success.** The
     * end state the caller asked for has been reached, and the 401 is only
     * saying the credential is no longer valid. Showing an error for it would
     * mean the one moment a person most wants confirmation is the moment they
     * are told something went wrong.
     */
    signOutUser(): Promise<SignOutResult>

    /** As {@link signOutUser}, at the worker's door. */
    signOutWorker(): Promise<SignOutResult>

    /** As {@link signOutUser}, at the administrator's door. */
    signOutAdmin(): Promise<SignOutResult>

    /** As {@link signOutUser}, at the super administrator's door. */
    signOutSuperAdmin(): Promise<SignOutResult>

    /**
     * Replace the signed-in end user's password.
     *
     * `current_password` is required and is not a convenience. The access token
     * proves who is asking; the current password proves it is the person rather
     * than a copy of their session. Without it, anybody who found a token could
     * set a new password and lock the real owner out permanently.
     *
     * Every *other* session the account held is withdrawn, on every device; this
     * one is spared, so the caller is not signed out of the application it is
     * standing in. Rejects with `validation` when the current password is wrong or
     * the new one is unchanged — the back end keys those on `current_password` and
     * `password` respectively, so a caller can put each message beside the right
     * input without mapping status codes to fields itself.
     */
    changePasswordUser(input: { current_password: string; password: string }): Promise<CurrentAccount>

    /** As {@link changePasswordUser}, at the worker's door. */
    changePasswordWorker(input: { current_password: string; password: string }): Promise<CurrentAccount>

    /** As {@link changePasswordUser}, at the administrator's door. */
    changePasswordAdmin(input: { current_password: string; password: string }): Promise<CurrentAccount>

    /** As {@link changePasswordUser}, at the super administrator's door. */
    changePasswordSuperAdmin(input: {
        current_password: string
        password: string
    }): Promise<CurrentAccount>

    /**
     * The mocked AI diagnosis behind the registration and home screens.
     *
     * **Mocked.** The controller takes no input and returns a literal, so this
     * resolves with the same object for every caller forever. It is typed and
     * validated so the screen is built against a real shape, not so a capability
     * exists.
     *
     * Rejects with an ApiError of kind `unauthenticated` or `forbidden` when the
     * token is missing or is not a customer token.
     */
    getDiagnosis(): Promise<DiagnosisResult>

    /**
     * The mocked categories a diagnosis can be one of.
     *
     * **Mocked.** Three fixed entries and a `recommended` that names one of them;
     * neither is ranked or scored.
     */
    getDiagnosisSuggestions(): Promise<DiagnosisSuggestions>

    /**
     * The mocked live position of a technician travelling to a booking.
     *
     * **Mocked, and this is the one most likely to be misread.** The coordinates,
     * the distance and `eta_minutes` are literals describing a journey that is not
     * happening, and nothing polls this endpoint. A screen that draws a map from
     * them draws a technician standing still forever — so do not render these as
     * live readings without saying that they are not.
     */
    getTracking(): Promise<LiveTracking>

    /**
     * The mocked bookings of the signed-in customer.
     *
     * **Mocked, and identical for every customer.** Two fixed bookings come back
     * regardless of whose token asked, which is the half that matters: a screen
     * rendering this looks right to whoever wrote it and is wrong to everybody.
     */
    listBookings(): Promise<BookingList>

    /**
     * The landing screen's two lists: service categories and featured
     * technicians.
     *
     * **Both are literals.** Nothing here was looked up, nothing was ranked and
     * no price was computed. A `200` means the screen has something to draw, and
     * it means nothing about whether any of it exists.
     *
     * The two lists are in one response because the dashboard draws them together
     * and reads them as one question. Splitting them would have meant two loading
     * states for one screen.
     */
    getDiscovery(): Promise<Discovery>

    /**
     * The answer to a search: three technicians and the numbers around them.
     *
     * **Mocked, and it ignores every sort it offers.** `filters` arrives with
     * identifiers and labels and no behaviour — nothing reads it, and nothing
     * reorders `technicians`. The order is the fixture's order, which is why the
     * highest-rated technician is listed last: a payload that had been sorted by
     * anything would not look like that.
     *
     * `found_count` is 24 and `technicians` holds three, which is what the design
     * draws and which a real endpoint would never do. **A screen must not use
     * `found_count` to decide how many cards to draw.**
     */
    getMatching(): Promise<Matching>

    /**
     * One booking's quote: who is coming, when they could come, what it costs
     * broken down, and how it could be paid for.
     *
     * **Mocked, and this is the operation most likely to be mistaken for a real
     * one.** The three estimate lines add up to `total` and nothing computed
     * either. No technician would turn up expecting to be paid that amount, and
     * `payment_methods` is three ways to pay that no gateway in this repository
     * can take.
     *
     * `booking` is the one route parameter in the generated client for a customer
     * route, so the identifier is substituted by the route function and the path
     * is never assembled by hand. **Any identifier other than `BK-2041` is
     * refused with a `404`** — the only mocked customer endpoint that can say no.
     */
    getBookingQuote(booking: string): Promise<BookingQuote>

    /**
     * Registration, answering `201` without creating anything.
     *
     * **Mocked, and it creates no account.** There is no registration in this
     * platform — accounts exist because an operator ran `fixmate:create-account`.
     * This echoes the `name` and `email` it was sent, ignores the password, and
     * returns a `token` that is a random string nothing accepts.
     *
     * The route sits behind the customer door itself, so it is unreachable before
     * an account already exists. A screen that treats a resolved promise as "this
     * person now has an account" is wrong, and `token` being present is what makes
     * that mistake easy to write.
     */
    registerUser(input: RegistrationInput): Promise<RegistrationResult>

    /**
     * Every product in the catalogue.
     *
     * The one operation on this API that needs no credential. It resolves with an
     * empty `data` array when the catalogue is empty — the back end answers 200
     * with `{"data": []}` and never 404 — so a caller renders a list either way
     * and never has to treat "no products" as an error.
     *
     * `price` is a number, so it can be formatted directly. A value that arrived
     * as a string is the one thing this response must never contain.
     */
    listProducts(): Promise<Product[]>
}

/**
 * Bind the operations to a configured client. Called once per application.
 */
export function createOperations(client: ApiClient): Operations {
    return {
        async signInUser(input) {
            const { data } = await client.request(definitions.signInUser.route, {
                body: input,
                response: definitions.signInUser.response,
            })

            return data
        },
        async signInWorker(input) {
            const { data } = await client.request(definitions.signInWorker.route, {
                body: input,
                response: definitions.signInWorker.response,
            })

            return data
        },
        async signInAdmin(input) {
            const { data } = await client.request(definitions.signInAdmin.route, {
                body: input,
                response: definitions.signInAdmin.response,
            })

            return data
        },
        async signInSuperAdmin(input) {
            const { data } = await client.request(definitions.signInSuperAdmin.route, {
                body: input,
                response: definitions.signInSuperAdmin.response,
            })

            return data
        },
        async forgotPasswordUser(input) {
            const { data } = await client.request(definitions.forgotPasswordUser.route, {
                body: input,
                response: definitions.forgotPasswordUser.response,
            })

            return data
        },
        async resetPasswordUser(input) {
            const { data } = await client.request(definitions.resetPasswordUser.route, {
                body: input,
                response: definitions.resetPasswordUser.response,
            })

            return data
        },
        async forgotPasswordWorker(input) {
            const { data } = await client.request(definitions.forgotPasswordWorker.route, {
                body: input,
                response: definitions.forgotPasswordWorker.response,
            })

            return data
        },
        async resetPasswordWorker(input) {
            const { data } = await client.request(definitions.resetPasswordWorker.route, {
                body: input,
                response: definitions.resetPasswordWorker.response,
            })

            return data
        },
        async forgotPasswordAdmin(input) {
            const { data } = await client.request(definitions.forgotPasswordAdmin.route, {
                body: input,
                response: definitions.forgotPasswordAdmin.response,
            })

            return data
        },
        async resetPasswordAdmin(input) {
            const { data } = await client.request(definitions.resetPasswordAdmin.route, {
                body: input,
                response: definitions.resetPasswordAdmin.response,
            })

            return data
        },
        async forgotPasswordSuperAdmin(input) {
            const { data } = await client.request(definitions.forgotPasswordSuperAdmin.route, {
                body: input,
                response: definitions.forgotPasswordSuperAdmin.response,
            })

            return data
        },
        async resetPasswordSuperAdmin(input) {
            const { data } = await client.request(definitions.resetPasswordSuperAdmin.route, {
                body: input,
                response: definitions.resetPasswordSuperAdmin.response,
            })

            return data
        },
        async currentUser() {
            const { data } = await client.request(definitions.currentUser.route, {
                response: definitions.currentUser.response,
            })

            return data
        },
        async currentWorker() {
            const { data } = await client.request(definitions.currentWorker.route, {
                response: definitions.currentWorker.response,
            })

            return data
        },
        async currentAdmin() {
            const { data } = await client.request(definitions.currentAdmin.route, {
                response: definitions.currentAdmin.response,
            })

            return data
        },
        async currentSuperAdmin() {
            const { data } = await client.request(definitions.currentSuperAdmin.route, {
                response: definitions.currentSuperAdmin.response,
            })

            return data
        },
        async showAdmin(admin) {
            const { data } = await client.request(definitions.showAdmin.route(admin), {
                response: definitions.showAdmin.response,
            })

            return data
        },
        async listAccounts() {
            const { data } = await client.request(definitions.listAccounts.route(), {
                response: definitions.listAccounts.response,
            })

            return data
        },
        async renewSessionUser() {
            const { data } = await client.request(definitions.renewSessionUser.route, {
                response: definitions.renewSessionUser.response,
            })

            return data
        },
        async renewSessionWorker() {
            const { data } = await client.request(definitions.renewSessionWorker.route, {
                response: definitions.renewSessionWorker.response,
            })

            return data
        },
        async renewSessionAdmin() {
            const { data } = await client.request(definitions.renewSessionAdmin.route, {
                response: definitions.renewSessionAdmin.response,
            })

            return data
        },
        async renewSessionSuperAdmin() {
            const { data } = await client.request(definitions.renewSessionSuperAdmin.route, {
                response: definitions.renewSessionSuperAdmin.response,
            })

            return data
        },
        async signOutUser() {
            const { data } = await client.request(definitions.signOutUser.route, {
                response: definitions.signOutUser.response,
            })

            return data
        },
        async signOutWorker() {
            const { data } = await client.request(definitions.signOutWorker.route, {
                response: definitions.signOutWorker.response,
            })

            return data
        },
        async signOutAdmin() {
            const { data } = await client.request(definitions.signOutAdmin.route, {
                response: definitions.signOutAdmin.response,
            })

            return data
        },
        async signOutSuperAdmin() {
            const { data } = await client.request(definitions.signOutSuperAdmin.route, {
                response: definitions.signOutSuperAdmin.response,
            })

            return data
        },
        // The four change-password bindings, which were **absent** from this object
        // until now: the operations were in `definitions`, in the contract and in
        // the OpenAPI document, and there was no way to call any of them. Nothing
        // caught it because `Operations` did not declare them either, so the type of
        // the thing being built and the type it claimed to be agreed with each other
        // and were both wrong. TypeScript could only have found it if the interface
        // had listed the operations the contract promised — which is the half that
        // was missing.
        //
        // `body` rather than `request`: the four definitions are the ones that send
        // something, and the distinction is documented on `RequestOptions`.
        async changePasswordUser(input) {
            const { data } = await client.request(definitions.changePasswordUser.route, {
                body: input,
                response: definitions.changePasswordUser.response,
            })

            return data
        },
        async changePasswordWorker(input) {
            const { data } = await client.request(definitions.changePasswordWorker.route, {
                body: input,
                response: definitions.changePasswordWorker.response,
            })

            return data
        },
        async changePasswordAdmin(input) {
            const { data } = await client.request(definitions.changePasswordAdmin.route, {
                body: input,
                response: definitions.changePasswordAdmin.response,
            })

            return data
        },
        async changePasswordSuperAdmin(input) {
            const { data } = await client.request(definitions.changePasswordSuperAdmin.route, {
                body: input,
                response: definitions.changePasswordSuperAdmin.response,
            })

            return data
        },
        // The five mocked customer operations. Each returns the payload whole
        // rather than destructuring `data`, because these five responses are not
        // wrapped in the envelope the rest of the API uses — see the note on the
        // `definitions` above.
        async getDiagnosis() {
            return client.request(definitions.getDiagnosis.route, {
                response: definitions.getDiagnosis.response,
            })
        },
        async getDiagnosisSuggestions() {
            return client.request(definitions.getDiagnosisSuggestions.route, {
                response: definitions.getDiagnosisSuggestions.response,
            })
        },
        async getTracking() {
            return client.request(definitions.getTracking.route, {
                response: definitions.getTracking.response,
            })
        },
        async listBookings() {
            return client.request(definitions.listBookings.route, {
                response: definitions.listBookings.response,
            })
        },
        async getDiscovery() {
            return client.request(definitions.getDiscovery.route, {
                response: definitions.getDiscovery.response,
            })
        },
        async getMatching() {
            return client.request(definitions.getMatching.route, {
                response: definitions.getMatching.response,
            })
        },
        async getBookingQuote(booking) {
            return client.request(definitions.getBookingQuote.route(booking), {
                response: definitions.getBookingQuote.response,
            })
        },
        async registerUser(input) {
            return client.request(definitions.registerUser.route, {
                body: input,
                response: definitions.registerUser.response,
            })
        },
        async listProducts() {
            const { data } = await client.request(definitions.listProducts.route, {
                response: definitions.listProducts.response,
            })

            return data
        },
    }
}

export {
    signInRequest,
    signInResponse,
    workerSignInResponse,
    forgotPasswordRequest,
    resetPasswordRequest,
    currentAccountResponse,
    adminAccountResponse,
}
