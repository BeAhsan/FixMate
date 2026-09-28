import { describe, expect, it } from 'vitest'
import { createOperations } from '../src/operations'
import { createApiClient } from '../src/http'
import { ApiError } from '../src/errors'

/**
 * The operations, tested the way an application uses them.
 *
 * This is where the two sides of the contract meet: the URL comes from the
 * generated function, and the shape comes from this package. The back end's own
 * feature tests assert the same shape over HTTP, so a disagreement between the
 * two is caught on both sides rather than in a browser.
 */

const reply = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status })

/**
 * A sign-in response, in full.
 *
 * The three session fields are not decoration and this fixture is the reason:
 * they became required when sign-in started issuing a renewal token, and the
 * schema rejected this fixture until they were added. A front end that treats a
 * session as one token would have been told here rather than discovering it as a
 * session that ends for no visible reason.
 *
 * `must_change_password` is here for the same reason, and its absence is worth
 * naming because it is the shape of the bug this file exists to catch: the field
 * was missing from the client's schema for the whole time story 21's front end
 * did not exist, and nothing failed. The response carried it, the client declared
 * nothing, and the extra field was accepted and thrown away — the schema only
 * fails on a field the client *promises* and the back end omits, never the
 * reverse. Making it required here is what turns that silence into a test
 * failure.
 */
const signInResponse = {
    data: {
        token: 'plain-text-token',
        user: { id: 1, name: 'Ahsan', email: 'ahsan@example.test' },
        abilities: ['users:*'],
        renewal_token: 'plain-text-renewal-token',
        access_token_expires_at: '2026-01-01T00:15:00+00:00',
        renewal_token_expires_at: '2026-01-02T00:00:00+00:00',
        must_change_password: false,
    },
}

const client = (fetch: typeof globalThis.fetch) => createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

const recordingFetch = (body: unknown, status = 200) => {
    const calls: string[] = []

    const fetch = (async (url: unknown) => {
        calls.push(String(url))

        return reply(status, body)()
    }) as unknown as typeof globalThis.fetch

    return { fetch, calls }
}

describe('signing in as an end user', () => {
    it('posts to the generated URL and returns the unwrapped result', async () => {
        const { fetch, calls } = recordingFetch(signInResponse)
        const operations = createOperations(client(fetch))

        const result = await operations.signInUser({ email: 'ahsan@example.test', password: 'password123' })

        expect(calls).toEqual(['https://api.fixmate.test/api/v1/identity/users/sign-in'])
        expect(result).toEqual({
            token: 'plain-text-token',
            user: { id: 1, name: 'Ahsan', email: 'ahsan@example.test' },
            abilities: ['users:*'],
            renewal_token: 'plain-text-renewal-token',
            access_token_expires_at: '2026-01-01T00:15:00+00:00',
            renewal_token_expires_at: '2026-01-02T00:00:00+00:00',
            must_change_password: false,
        })
    })

    it('reports that a password must be changed rather than dropping the field', async () => {
        // The same shape, one field different. This is the assertion that the field
        // survives the client rather than being accepted-and-discarded, which is
        // what happened for as long as the schema did not mention it.
        const { fetch } = recordingFetch({
            data: { ...signInResponse.data, must_change_password: true },
        })
        const operations = createOperations(client(fetch))

        const result = await operations.signInUser({
            email: 'ahsan@example.test',
            password: 'password123',
        })

        expect(result.must_change_password).toBe(true)
    })

    it('reports the flag on a renewal, which is the only call a reload makes', async () => {
        // Renewal is exempt from the back end's `must_change_password` guard, and
        // this is the client half of why that is safe to do: a session restored from
        // browser storage runs a renewal and nothing else, so without this field the
        // only evidence that the account is flagged would be the 403 every other
        // route returns — and the front end would have to recognise it by wording.
        const { fetch, calls } = recordingFetch({
            data: {
                access_token: 'plain-text-access-token',
                renewal_token: 'plain-text-renewal-token',
                access_token_expires_at: '2026-01-01T00:15:00+00:00',
                renewal_token_expires_at: '2026-01-02T00:00:00+00:00',
                must_change_password: true,
            },
        })
        const operations = createOperations(client(fetch))

        const result = await operations.renewSessionUser()

        expect(calls).toEqual([
            'https://api.fixmate.test/api/v1/identity/users/session/renew',
        ])
        expect(result.must_change_password).toBe(true)
    })

    it('rejects refused credentials as a validation failure with a field error', async () => {
        const { fetch } = recordingFetch(
            { message: 'The provided credentials are incorrect.', errors: { email: ['The provided credentials are incorrect.'] } },
            422,
        )
        const operations = createOperations(client(fetch))

        const error = (await operations
            .signInUser({ email: 'ahsan@example.test', password: 'wrong' })
            .catch((e: unknown) => e)) as ApiError

        expect(error).toBeInstanceOf(ApiError)
        expect(error.kind).toBe('validation')
        expect(error.fields['email']).toEqual(['The provided credentials are incorrect.'])
    })

    it('rejects a response the back end no longer sends in the declared shape', async () => {
        // The field the front end depends on is gone. Built by deleting from a
        // complete response rather than written short, so this keeps testing
        // what it says it tests as the sign-in shape gains fields.
        const { user, ...withoutTheAccount } = signInResponse.data
        const { fetch } = recordingFetch({ data: { ...withoutTheAccount, user: undefined } })
        const operations = createOperations(client(fetch))

        const error = (await operations
            .signInUser({ email: 'ahsan@example.test', password: 'password123' })
            .catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('contract')
        expect(error.message).toContain('data.user')
    })

    it('rejects a throttled sign-in as retryable', async () => {
        const { fetch } = recordingFetch({ message: 'Too Many Attempts.' }, 429)
        const operations = createOperations(client(fetch))

        const error = (await operations
            .signInUser({ email: 'ahsan@example.test', password: 'password123' })
            .catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('rateLimited')
        expect(error.retryable).toBe(true)
    })
})

describe('recovering an account by resetting its password', () => {
    const acknowledgement = { data: { message: 'If that address belongs to an account, a password reset link is on its way.' } }

    it('posts to the generated URL for the account type and unwraps the message', async () => {
        const { fetch, calls } = recordingFetch(acknowledgement, 202)
        const operations = createOperations(client(fetch))

        const result = await operations.forgotPasswordWorker({ email: 'ahsan@example.test' })

        expect(calls).toEqual(['https://api.fixmate.test/api/v1/identity/workers/forgot-password'])
        expect(result).toEqual({ message: acknowledgement.data.message })
    })

    it('redeems a link at the same account type it was requested from', async () => {
        // The two halves are separate operations rather than one with a store
        // parameter, so a front end physically cannot ask for a link against a
        // store that is not its own. Redeeming at the wrong one is the back end's
        // refusal, and the message it gives is the same one a spent link gets.
        const { fetch, calls } = recordingFetch({ data: { message: 'Your password has been changed.' } })
        const operations = createOperations(client(fetch))

        const result = await operations.resetPasswordWorker({
            email: 'ahsan@example.test',
            token: 'a-token-from-the-link',
            password: 'a-freshly-chosen-Password1!',
        })

        expect(calls).toEqual(['https://api.fixmate.test/api/v1/identity/workers/reset-password'])
        expect(result).toEqual({ message: 'Your password has been changed.' })
    })

    it('rejects a password the back end will not accept, filed against the password', async () => {
        const { fetch } = recordingFetch(
            { message: 'The password field must be at least 12 characters.', errors: { password: ['The password field must be at least 12 characters.'] } },
            422,
        )
        const operations = createOperations(client(fetch))

        const error = (await operations
            .resetPasswordUser({ email: 'ahsan@example.test', token: 'a-token', password: 'short' })
            .catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('validation')
        expect(error.fields['password']).toEqual(['The password field must be at least 12 characters.'])
    })

    it('rejects a spent or expired link under the neutral key, with no account details', async () => {
        const { fetch } = recordingFetch(
            {
                message: 'This password reset link is no longer valid. Request a new one.',
                errors: { password_reset: ['This password reset link is no longer valid. Request a new one.'] },
            },
            422,
        )
        const operations = createOperations(client(fetch))

        const error = (await operations
            .resetPasswordAdmin({ email: 'ahsan@example.test', token: 'spent', password: 'a-freshly-chosen-Password1!' })
            .catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('validation')
        expect(error.fields['password_reset']).toEqual(['This password reset link is no longer valid. Request a new one.'])
        expect(error.fields['email']).toBeUndefined()
    })
})

/**
 * The authenticated operations, which are the first that carry a bearer token and
 * the first that can be refused by the back end for a reason other than bad input.
 */
describe('asking who the token belongs to', () => {
    const currentAccount = {
        data: {
            account_type: 'users',
            account: { id: 7, name: 'Ahsan', email: 'ahsan@example.test', status: 'active' },
            abilities: ['users:*'],
        },
    }

    const recordingRequest = (body: unknown, status = 200) => {
        const calls: { url: string; method: string; body: unknown; authorization: string | null }[] = []

        const fetch = (async (url: unknown, init: RequestInit = {}) => {
            calls.push({
                url: String(url),
                method: init.method ?? 'GET',
                body: init.body,
                authorization: new Headers(init.headers).get('Authorization'),
            })

            return reply(status, body)()
        }) as unknown as typeof globalThis.fetch

        return { fetch, calls }
    }

    it('calls the customer door, not a shared one', async () => {
        // Four operations rather than one, so that a front end physically cannot
        // ask "who am I" at a door that does not belong to it — which is the half
        // of the property that is a client concern rather than a server one.
        const { fetch, calls } = recordingRequest(currentAccount)
        const operations = createOperations(client(fetch))

        const result = await operations.currentUser()

        expect(calls[0]?.url).toBe('https://api.fixmate.test/api/v1/identity/users/me')
        expect(result.account_type).toBe('users')
        expect(result.abilities).toEqual(['users:*'])
    })

    it('sends a GET with no body', async () => {
        const { fetch, calls } = recordingRequest(currentAccount)
        const operations = createOperations(client(fetch))

        await operations.currentWorker()

        expect(calls[0]?.method).toBe('GET')
        expect(calls[0]?.body).toBeUndefined()
    })

    it('sends the bearer token the client was configured with', async () => {
        const { fetch, calls } = recordingRequest(currentAccount)
        const operations = createOperations(
            createApiClient({
                baseUrl: 'https://api.fixmate.test',
                fetch,
                getAccessToken: () => 'plain-text-token',
            }),
        )

        await operations.currentUser()

        expect(calls[0]?.authorization).toBe('Bearer plain-text-token')
    })

    it('reports a token belonging to another account type as forbidden, with the back end message', async () => {
        // The message names both types. A person who signed in at the wrong door is
        // told which door to use, not that their password was wrong — so this is
        // asserted through rather than replaced with a local string, because the
        // wording is a decision the back end makes and a front end should show.
        const message =
            'This token is for end user account, not worker account. Sign in at the worker application to use this endpoint.'
        const { fetch } = recordingRequest({ message }, 403)
        const operations = createOperations(client(fetch))

        const error = (await operations.currentWorker().catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('forbidden')
        expect(error.message).toBe(message)
    })

    it('reports a missing or revoked token as unauthenticated', async () => {
        const { fetch } = recordingRequest({ message: 'Unauthenticated.' }, 401)
        const operations = createOperations(client(fetch))

        const error = (await operations.currentUser().catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('unauthenticated')
        expect(error.requiresAuthentication).toBe(true)
    })

    it('reports a suspension as forbidden rather than as an expired session', async () => {
        // Deliberately not `unauthenticated`. The token is still valid; the account
        // is not permitted. A front end that treated this as a signed-out state
        // would send the person to the sign-in screen, where the same refusal
        // would follow them, and no amount of retyping would get past it.
        const { fetch } = recordingRequest(
            { message: 'Your account has been suspended. Please contact an administrator to have it restored.' },
            403,
        )
        const operations = createOperations(client(fetch))

        const error = (await operations.currentUser().catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('forbidden')
        expect(error.requiresAuthentication).toBe(false)
    })

    it('rejects a response that stopped carrying the account type', async () => {
        // The field that lets a front end notice it holds the wrong token. If the
        // back end stops sending it, that must be a contract failure here rather
        // than an application rendering a blank identity.
        const { fetch } = recordingRequest({
            data: { account: currentAccount.data.account, abilities: [] },
        })
        const operations = createOperations(client(fetch))

        const error = (await operations.currentUser().catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('contract')
        expect(error.message).toContain('data.account_type')
    })

    it('rejects a response missing a field it promised', async () => {
        const { fetch } = recordingRequest({
            data: { account_type: 'users', account: { id: 7, name: 'Ahsan' }, abilities: [] },
        })
        const operations = createOperations(client(fetch))

        const error = (await operations.currentUser().catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('contract')
        expect(error.message).toContain('data.account')
    })
})

describe('reading one administrator record', () => {
    const admin = { data: { id: 4, name: 'Ada Admin', email: 'ada@example.test', status: 'active' } }

    it('substitutes the identifier into the generated URL', async () => {
        // The parameter is not written by hand anywhere. The generated function
        // owns the URL, so a change to the route's shape cannot leave this calling
        // a path the back end no longer serves.
        const { fetch, calls } = (() => {
            const seen: string[] = []
            const fetch = (async (url: unknown) => {
                seen.push(String(url))

                return reply(200, admin)()
            }) as unknown as typeof globalThis.fetch

            return { fetch, calls: seen }
        })()
        const operations = createOperations(client(fetch))

        const result = await operations.showAdmin(4)

        expect(calls).toEqual(['https://api.fixmate.test/api/v1/identity/admins/4'])
        expect(result).toEqual({ id: 4, name: 'Ada Admin', email: 'ada@example.test', status: 'active' })
    })

    it('reports a missing record as not found, for a caller that is allowed to ask', async () => {
        const { fetch } = (() => {
            const fetch = (async () => reply(404, { message: 'That account does not exist.' })()) as unknown as typeof globalThis.fetch

            return { fetch }
        })()
        const operations = createOperations(client(fetch))

        const error = (await operations.showAdmin(999).catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('notFound')
    })

    it('reports a refusal as forbidden, and never as not found', async () => {
        // The property that makes this endpoint safe to expose: an administrator
        // asking for an identifier they may not see gets the same 403 whether or
        // not that identifier exists. A 404 here would be a way of discovering
        // which administrator accounts exist, so a caller receiving `notFound` can
        // be sure it was allowed to ask.
        const { fetch } = (() => {
            const fetch = (async () =>
                reply(403, { message: 'Your account is not permitted to perform this action.' })()) as unknown as typeof globalThis.fetch

            return { fetch }
        })()
        const operations = createOperations(client(fetch))

        const error = (await operations.showAdmin(4).catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('forbidden')
        expect(error.kind).not.toBe('notFound')
    })

    it('never asks for a password hash, because the shape has no field for one', async () => {
        // The back end's own feature test asserts the key set is exactly these
        // four. Here the point is the other direction: a field the back end starts
        // sending is ignored, so adding a column to the admins table cannot reach a
        // front end by accident.
        const { fetch } = (() => {
            const fetch = (async () =>
                reply(200, { data: { ...admin.data, password: '$2y$12$hashed' } })()) as unknown as typeof globalThis.fetch

            return { fetch }
        })()
        const operations = createOperations(client(fetch))

        const result = await operations.showAdmin(4)

        expect(result).toEqual({ id: 4, name: 'Ada Admin', email: 'ada@example.test', status: 'active' })
    })
})
