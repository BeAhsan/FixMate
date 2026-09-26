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

const signInResponse = {
    data: {
        token: 'plain-text-token',
        user: { id: 1, name: 'Ahsan', email: 'ahsan@example.test' },
        abilities: ['users:*'],
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
        })
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
        // The field the front end depends on is gone.
        const { fetch } = recordingFetch({ data: { token: 't', abilities: [] } })
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
