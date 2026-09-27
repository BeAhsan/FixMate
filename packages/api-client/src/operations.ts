import { signin as signinUser } from './generated/routes/users'
import { signin as signinWorker } from './generated/routes/workers'
import { signin as signinAdmin } from './generated/routes/admins'
import { signin as signinSuperAdmin } from './generated/routes/super-admins'
import { forgotPassword as forgotPasswordUser, resetPassword as resetPasswordUser } from './generated/routes/users'
import { forgotPassword as forgotPasswordWorker, resetPassword as resetPasswordWorker } from './generated/routes/workers'
import {
    forgotPassword as forgotPasswordAdmin,
    resetPassword as resetPasswordAdmin,
} from './generated/routes/admins'
import {
    forgotPassword as forgotPasswordSuperAdmin,
    resetPassword as resetPasswordSuperAdmin,
} from './generated/routes/super-admins'
import { me as currentUser } from './generated/routes/users'
import { me as currentWorker } from './generated/routes/workers'
import { me as currentAdmin, record as adminRecord } from './generated/routes/admins'
import { me as currentSuperAdmin } from './generated/routes/super-admins'
// Imported from the nested directory rather than off the `super-admins` barrel,
// so the import names the route the operation was generated from.
import { record as anyAdminRecord } from './generated/routes/super-admins/admins'
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
 * Two of the operations below bind their route as a *function* of an identifier
 * rather than as a fixed route, because they are the only ones whose URL is not
 * fully known when the module loads. Building the URL once and reusing it would
 * mean one administrator's identifier baked into a module-level constant, which
 * is a bug that only shows up for the second record a person opens.
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
 * One account as a "who am I" answer describes it.
 *
 * The back end names the account type in the body and calls the field `account`
 * rather than naming it after the store, because the caller is the one asking
 * and the answer has to be able to say that the thing answering is a customer
 * when a worker was expected. That is how an application notices it has been
 * handed the wrong token rather than rendering an empty screen — and it is
 * exactly what a shared `me` route cannot avoid, since the account type is
 * carried in the body rather than chosen by the URL.
 */
export interface CurrentAccountResult {
    account_type: string
    account: {
        id: number
        name: string
        email: string
        status: string
    }
    /**
     * The token's own claim list, not a fresh decision. A front end may use it to
     * hide navigation, and it cannot be used to widen anything: the endpoints the
     * navigation leads to are refused by the back end on the same list.
     */
    abilities: string[]
}

/**
 * One account as a reader who is not that account may see it.
 *
 * Flat, and with no `abilities` key at all. The back end leaves the list out
 * because abilities in this platform describe the token that asked rather than
 * the record being read, and a client that rendered the target's abilities would
 * be showing one person's authority in another person's window. The shape here
 * does not accept an extra `abilities` field either, so a future back end that
 * started sending one would fail this package's tests rather than quietly
 * offering links the caller cannot follow.
 */
export interface AccountSummaryResult {
    account_type: string
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
 * The "who am I" answer, which is the same shape for all four account types.
 *
 * One shape rather than four, because that is the point of the endpoint: an
 * application that already knows what it is still gets told, and the four
 * applications share one type rather than each declaring a near-identical copy
 * that a change to the back end's answer would have to be applied to four times.
 */
const currentAccountResponse: Schema<{ data: CurrentAccountResult }> = object({
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

/**
 * Another account's record. Absent `abilities` on purpose — see
 * `AccountSummaryResult`.
 */
const accountSummaryResponse: Schema<{ data: AccountSummaryResult }> = object({
    data: object({
        account_type: string(),
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
    currentUser: {
        route: currentUser() satisfies Route,
        response: currentAccountResponse,
    },
    currentWorker: {
        route: currentWorker() satisfies Route,
        response: currentAccountResponse,
    },
    currentAdmin: {
        route: currentAdmin() satisfies Route,
        response: currentAccountResponse,
    },
    currentSuperAdmin: {
        route: currentSuperAdmin() satisfies Route,
        response: currentAccountResponse,
    },
    adminRecord: {
        route: (admin: number) => adminRecord(admin) satisfies Route,
        response: accountSummaryResponse,
    },
    anyAdminRecord: {
        route: (admin: number) => anyAdminRecord(admin) satisfies Route,
        response: accountSummaryResponse,
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
     * Who the customer application's token belongs to.
     *
     * Rejects with a `forbidden` ApiError whose `code` is `wrong_account_type` if
     * the token in hand is not a customer's — which is the answer a person gets
     * when the wrong application has been given the wrong token, and is a
     * different problem from a missing ability. `currentUser`, `currentWorker`,
     * `currentAdmin` and `currentSuperAdmin` are four operations rather than one
     * with a parameter, so a front end cannot name the account type it would like
     * to be: the back end's answer is decided by the URL it called.
     */
    currentUser(): Promise<CurrentAccountResult>

    /** Who the worker application's token belongs to. */
    currentWorker(): Promise<CurrentAccountResult>

    /** Who the administrator application's token belongs to. */
    currentAdmin(): Promise<CurrentAccountResult>

    /**
     * Who the super administrator application's token belongs to.
     *
     * The only account type whose abilities are the wildcard, and therefore the
     * only one these operations can succeed for with a token issued by any other
     * door.
     */
    currentSuperAdmin(): Promise<CurrentAccountResult>

    /**
     * Read one administrator's record from inside the administrator application.
     *
     * The back end will return this for the caller's own record and refuses
     * everything else with a `forbidden` ApiError whose `code` is
     * `not_the_record_owner`. That refusal is deliberately identical for a record
     * that belongs to somebody else and one that does not exist, so a caller
     * cannot use this operation to find out which identifiers are real.
     */
    adminRecord(admin: number): Promise<AccountSummaryResult>

    /**
     * Read one administrator's record across the store boundary.
     *
     * Reached only by a token holding the back end's `accounts:read` ability,
     * which no account type below super administrator holds. An administrator
     * calling this gets the same `not_the_record_owner` refusal as calling
     * `adminRecord` for a stranger's identifier, so the ability is not something a
     * front end can work around by choosing the other operation.
     */
    anyAdminRecord(admin: number): Promise<AccountSummaryResult>
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
        async adminRecord(admin) {
            const { data } = await client.request(definitions.adminRecord.route(admin), {
                response: definitions.adminRecord.response,
            })

            return data
        },
        async anyAdminRecord(admin) {
            const { data } = await client.request(definitions.anyAdminRecord.route(admin), {
                response: definitions.anyAdminRecord.response,
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
    accountSummaryResponse,
}
