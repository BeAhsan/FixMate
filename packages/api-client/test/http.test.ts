import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/errors'
import { createApiClient, buildQuery, type Route } from '../src/http'
import { object, string } from '../src/schema'

/**
 * The fetch wrapper, tested through the only interface an application uses.
 *
 * A fake fetch stands in for the network, so what is asserted is what the
 * wrapper did: the URL and method it asked for, the headers it attached, and
 * the single error type everything arrives as. Nothing here reaches inside the
 * wrapper, so a refactor that keeps that behaviour keeps these tests passing.
 */

const signIn: Route = { url: '/api/v1/identity/users/sign-in', method: 'post' }

const signInBody = {
    data: {
        token: 'plain-text-token',
        user: { id: 1, name: 'Ahsan', email: 'ahsan@example.test' },
        abilities: ['users:*'],
    },
}

const okSchema = object({ data: object({ token: string() }) })

interface Call {
    url: string
    init: RequestInit
}

function fakeFetch(reply: () => Response | Promise<Response>) {
    const calls: Call[] = []

    const fetch = (async (url: unknown, init: unknown) => {
        calls.push({ url: String(url), init: init as RequestInit })

        return reply()
    }) as unknown as typeof globalThis.fetch

    return { fetch, calls }
}

const json = (status: number, body: unknown): Response =>
    new Response(body === undefined ? '' : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })

const headersOf = (call: Call): Record<string, string> => call.init.headers as Record<string, string>

describe('making a request', () => {
    it('calls the generated URL and verb', async () => {
        const { fetch, calls } = fakeFetch(() => json(200, signInBody))
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

        await client.request(signIn, { body: { email: 'a@b.test' }, response: okSchema })

        expect(calls[0]?.url).toBe('https://api.fixmate.test/api/v1/identity/users/sign-in')
        expect(calls[0]?.init.method).toBe('POST')
        expect(calls[0]?.init.body).toBe(JSON.stringify({ email: 'a@b.test' }))
    })

    it('strips a trailing slash from the configured base URL', async () => {
        const { fetch, calls } = fakeFetch(() => json(200, signInBody))
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test/', fetch })

        await client.request(signIn, { response: okSchema })

        expect(calls[0]?.url).toBe('https://api.fixmate.test/api/v1/identity/users/sign-in')
    })

    it('sends no body when none is given', async () => {
        const { fetch, calls } = fakeFetch(() => json(200, signInBody))
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

        await client.request(signIn, { response: okSchema })

        expect(calls[0]?.init.body).toBeUndefined()
    })

    it('never sends cookies, so an ambient cookie cannot authenticate a request', async () => {
        const { fetch, calls } = fakeFetch(() => json(200, signInBody))
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

        await client.request(signIn, { response: okSchema })

        expect(calls[0]?.init.credentials).toBe('omit')
    })
})

describe('attaching the access token', () => {
    it('is done by the client, not by the application', async () => {
        const { fetch, calls } = fakeFetch(() => json(200, signInBody))
        const client = createApiClient({
            baseUrl: 'https://api.fixmate.test',
            fetch,
            getAccessToken: () => 'a-token',
        })

        await client.request(signIn, { response: okSchema })

        expect(headersOf(calls[0]!)['Authorization']).toBe('Bearer a-token')
    })

    it('reads the token per request, so a renewal is picked up without reconfiguring', async () => {
        const { fetch, calls } = fakeFetch(() => json(200, signInBody))
        let token: string | null = null
        const client = createApiClient({
            baseUrl: 'https://api.fixmate.test',
            fetch,
            getAccessToken: () => token,
        })

        await client.request(signIn, { response: okSchema })
        token = 'renewed'
        await client.request(signIn, { response: okSchema })

        expect(headersOf(calls[0]!)['Authorization']).toBeUndefined()
        expect(headersOf(calls[1]!)['Authorization']).toBe('Bearer renewed')
    })

    it('sends no header when signed out', async () => {
        const { fetch, calls } = fakeFetch(() => json(200, signInBody))
        const client = createApiClient({
            baseUrl: 'https://api.fixmate.test',
            fetch,
            getAccessToken: () => null,
        })

        await client.request(signIn, { response: okSchema })

        expect(headersOf(calls[0]!)).not.toHaveProperty('Authorization')
    })
})

describe('every failure arriving as one shape', () => {
    const cases: Array<[string, number, unknown, string]> = [
        ['refused credentials', 422, { message: 'The provided credentials are incorrect.', errors: { email: ['The provided credentials are incorrect.'] } }, 'validation'],
        ['expired token', 401, { message: 'Unauthenticated.' }, 'unauthenticated'],
        ['wrong account type', 403, { message: 'This action is unauthorized.' }, 'forbidden'],
        ['throttled sign-in', 429, { message: 'Too Many Attempts.' }, 'rateLimited'],
        ['stale csrf token', 419, { message: 'CSRF token mismatch.' }, 'rateLimited'],
        ['a crashed container', 500, { message: 'Server Error' }, 'server'],
        ['an unknown failure', 418, { message: 'Teapot' }, 'unknown'],
    ]

    for (const [name, status, body, kind] of cases) {
        it(`maps ${name} to ${kind}`, async () => {
            const { fetch } = fakeFetch(() => json(status, body))
            const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

            const error = await client.request(signIn, { response: okSchema }).catch((e: unknown) => e)

            expect(error).toBeInstanceOf(ApiError)
            expect((error as ApiError).kind).toBe(kind)
            expect((error as ApiError).status).toBe(status)
        })
    }

    it('carries the field errors Laravel returns', async () => {
        const { fetch } = fakeFetch(() =>
            json(422, { message: 'The provided credentials are incorrect.', errors: { email: ['Incorrect.'] } }),
        )
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

        const error = (await client.request(signIn, { response: okSchema }).catch((e: unknown) => e)) as ApiError

        expect(error.fields).toEqual({ email: ['Incorrect.'] })
    })

    it('marks a server failure and a throttle as retryable, and a refusal as not', async () => {
        const { fetch } = fakeFetch(() => json(503, { message: 'Unavailable' }))
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

        const error = (await client.request(signIn, { response: okSchema }).catch((e: unknown) => e)) as ApiError

        expect(error.retryable).toBe(true)
    })

    it('reports an unreachable back end as a network failure with status 0', async () => {
        const { fetch } = fakeFetch(() => {
            throw new TypeError('Failed to fetch')
        })
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

        const error = (await client.request(signIn, { response: okSchema }).catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('network')
        expect(error.status).toBe(0)
        expect(error.requiresAuthentication).toBe(false)
    })

    it('flags an expired token as the one failure worth re-authenticating for', async () => {
        const { fetch } = fakeFetch(() => json(401, { message: 'Unauthenticated.' }))
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

        const error = (await client.request(signIn, { response: okSchema }).catch((e: unknown) => e)) as ApiError

        expect(error.requiresAuthentication).toBe(true)
    })

    it('survives an error response that is not JSON at all', async () => {
        // An nginx 502 page is HTML. A JSON parse error there would hide the
        // status that actually mattered.
        const { fetch } = fakeFetch(
            () => new Response('<html>502 Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
        )
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

        const error = (await client.request(signIn, { response: okSchema }).catch((e: unknown) => e)) as ApiError

        expect(error.kind).toBe('server')
        expect(error.status).toBe(502)
    })
})

describe('a response that no longer matches its declared shape', () => {
    it('fails with a clear message naming the field, not a TypeError', async () => {
        // What a back-end change looks like: `user` is now a string.
        const { fetch } = fakeFetch(() => json(200, { data: { token: 't', user: 'Ahsan', abilities: [] } }))
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

        const shape = object({ data: object({ user: object({ name: string() }) }) })
        const error = (await client.request(signIn, { response: shape }).catch((e: unknown) => e)) as ApiError

        expect(error).toBeInstanceOf(ApiError)
        expect(error.kind).toBe('contract')
        expect(error.code).toBe('response_shape_mismatch')
        expect(error.message).toContain('data.user')
        expect(error.retryable).toBe(false)
    })

    it('returns the validated value when the shape does match', async () => {
        const { fetch } = fakeFetch(() => json(200, signInBody))
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

        await expect(client.request(signIn, { response: okSchema })).resolves.toEqual({ data: { token: 'plain-text-token' } })
    })
})

describe('building a query string', () => {
    it('skips null and undefined rather than sending them as text', () => {
        expect(buildQuery({ page: 2, search: 'a b', filter: null, absent: undefined })).toBe('?page=2&search=a+b')
    })

    it('is empty when there is nothing to send', () => {
        expect(buildQuery()).toBe('')
        expect(buildQuery({ filter: null })).toBe('')
    })

    it('is appended to the route URL', async () => {
        const { fetch, calls } = fakeFetch(() => json(200, signInBody))
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test', fetch })

        await client.request(signIn, { response: okSchema, query: { page: 2 } })

        expect(calls[0]?.url).toBe('https://api.fixmate.test/api/v1/identity/users/sign-in?page=2')
    })
})
