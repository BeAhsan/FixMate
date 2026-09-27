import { signin as signinUser } from './generated/routes/users'
import { me as meUser } from './generated/routes/users'
import { signin as signinWorker } from './generated/routes/workers'
import { me as meWorker } from './generated/routes/workers'
import { signin as signinAdmin } from './generated/routes/admins'
import { signin as signinSuperAdmin } from './generated/routes/super-admins'
import { forgotPassword as forgotPasswordUser, resetPassword as resetPasswordUser } from './generated/routes/users'
import { forgotPassword as forgotPasswordWorker, resetPassword as resetPasswordWorker } from './generated/routes/workers'
import {
    forgotPassword as forgotPasswordAdmin,
    me as meAdmin,
    resetPassword as resetPasswordAdmin,
    show as showAdmin,
} from './generated/routes/admins'
import {
    forgotPassword as forgotPasswordSuperAdmin,
    me as meSuperAdmin,
    resetPassword as resetPasswordSuperAdmin,
} from './generated/routes/super-admins'
import { array, number, object, string, type Schema } from './schema'
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
}

export interface WorkerSignInResult {
    token: string
    worker: SignInAccount
    abilities: string[]
}

export interface AdminSignInResult {
    token: string
    admin: SignInAccount
    abilities: string[]
}

export interface SuperAdminSignInResult {
    token: string
    super_admin: SignInAccount
    abilities: string[]
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
    }),
})

const superAdminSignInResponse: Schema<{ data: SuperAdminSignInResult }> = object({
    data: object({
        token: string(),
        super_admin: object(accountFields),
        abilities: array(string()),
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
