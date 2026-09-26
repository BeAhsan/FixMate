import { signin as signinUser } from './generated/routes/users'
import { signin as signinWorker } from './generated/routes/workers'
import { signin as signinAdmin } from './generated/routes/admins'
import { signin as signinSuperAdmin } from './generated/routes/super-admins'
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
    }
}

export { signInRequest, signInResponse, workerSignInResponse }
