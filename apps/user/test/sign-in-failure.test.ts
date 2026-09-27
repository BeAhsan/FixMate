import { ApiError } from '@fixmate/api-client'
import { describe, expect, it } from 'vitest'
import { describeSignInFailure } from '../lib/sign-in-failure'

/**
 * The three ways a sign-in can fail, and the one rule that governs all of them:
 * the back end's own wording is passed through untouched.
 *
 * That rule is the reason these are asserted rather than eyeballed. The sign-in
 * refusal is deliberately indistinguishable between an unknown address, a wrong
 * password and a suspended account, and a second wording written in the front
 * end is a second chance to leak which one it was.
 */

function apiError(overrides: Partial<ConstructorParameters<typeof ApiError>[0]>) {
    return new ApiError({
        kind: 'validation',
        message: 'These credentials do not match our records.',
        status: 422,
        code: null,
        fields: {},
        retryable: false,
        ...overrides,
    })
}

describe('a refused sign-in', () => {
    it('shows the back end’s message exactly as it was sent', () => {
        const failure = describeSignInFailure(apiError({}))

        expect(failure.message).toBe('These credentials do not match our records.')
    })

    it('carries the per-field messages through rather than dropping them', () => {
        const failure = describeSignInFailure(
            apiError({
                fields: { credentials: ['These credentials do not match our records.'] },
            }),
        )

        expect(failure.fields).toEqual({
            credentials: ['These credentials do not match our records.'],
        })
    })

    it('shows the suspended message when that is what the back end said', () => {
        // Reachable only after the password has been verified, so passing the
        // sentence through verbatim is safe and is the useful thing to do.
        const message =
            'Your account has been suspended. Please contact an administrator to have it restored.'

        expect(describeSignInFailure(apiError({ kind: 'forbidden', status: 403, message })).message).toBe(
            message,
        )
    })

    it('shows what the throttle said, including the wait', () => {
        const failure = describeSignInFailure(
            apiError({ kind: 'rateLimited', status: 429, message: 'Too many attempts. Try again in 47 seconds.' }),
        )

        expect(failure.message).toContain('47 seconds')
    })
})

describe('a failure the back end could not describe', () => {
    it('says so when it was never reached', () => {
        const failure = describeSignInFailure(
            apiError({ kind: 'network', status: 0, message: 'The request failed.' }),
        )

        expect(failure.message).toMatch(/could not reach/i)
        // A blank screen is the outcome that tells a person nothing about
        // whether retrying is worth doing.
        expect(failure.message).not.toBe('')
    })

    it('blames the contract rather than the password when the shape is wrong', () => {
        const failure = describeSignInFailure(
            apiError({
                kind: 'contract',
                status: 200,
                message: 'Response did not match the declared shape at data.token.',
            }),
        )

        expect(failure.message).toMatch(/shape/i)
        expect(failure.message).not.toMatch(/password/i)
    })

    it('falls back to a sentence for something that is not an ApiError at all', () => {
        // A bug in this application rather than a refusal by the back end, and
        // the one case where there is no message to pass through.
        const failure = describeSignInFailure(new TypeError('cannot read properties of undefined'))

        expect(failure.message).toBe('Something went wrong signing in. Please try again.')
        expect(failure.fields).toBeUndefined()
    })
})
