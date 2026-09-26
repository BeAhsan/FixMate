import { signin } from './generated/routes/users'
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

export interface SignInResult {
    token: string
    user: {
        id: number
        name: string
        email: string
    }
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

const definitions = {
    signInUser: {
        // Calling the generated function yields its URL and verb. The URL is
        // never written by hand, so it cannot drift from the back end's route.
        route: signin() satisfies Route,
        request: signInRequest,
        response: signInResponse,
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
    }
}

export { signInRequest, signInResponse }
