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
