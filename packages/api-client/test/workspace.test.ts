import { describe, expect, it } from 'vitest'
import * as apiClient from '@fixmate/api-client'
import { createApiClient, createOperations } from '@fixmate/api-client'

/**
 * The workspace seam, tested.
 *
 * Every other test in this package imports through a relative path — `../src/…` —
 * because that is the shortest way to reach a file. The four applications will
 * not do that. They will write `@fixmate/api-client` and expect npm to have
 * linked this package into the workspace root.
 *
 * **What this file cannot prove, and why that is worth writing down.** Node,
 * TypeScript and Vite all let a package resolve its *own* name through its own
 * `exports` map. So the imports below succeed with the workspace link deleted
 * outright — verified, by removing `node_modules/@fixmate/api-client` and
 * watching this file still pass. An in-package import therefore says nothing
 * about whether the workspace is wired, and a test written as though it did
 * would be decoration.
 *
 * The link is checked at the gate instead: `npm install` and
 * `npm ls --workspaces` both have to succeed, and npm will not complete a
 * workspace whose globs match no package. Asserting it from in here would mean
 * reaching for `node:fs`, and this package sets `"types": []` on purpose — its
 * source is browser code and must not be able to see node globals — so paying
 * for `@types/node` and a second tsconfig to re-assert what the install already
 * guarantees is the wrong trade.
 *
 * The first application is where this gets its real test. A member living
 * outside this package has no `exports` map of its own to fall back on, so its
 * import proves the link for free.
 */

describe('importing this package by the name an application writes', () => {
    it('resolves the bare specifier', () => {
        expect(typeof createApiClient).toBe('function')
        expect(typeof createOperations).toBe('function')
    })

    it('yields one module, not two', () => {
        // Two copies would mean two sets of the classes in errors.ts, and an
        // `instanceof ApiError` check on one side would fail against the other.
        expect(apiClient.createApiClient).toBe(createApiClient)
    })

    it('reaches the generated routes, so the client was built before this ran', () => {
        // The generated directory is not committed, so a build that resolved
        // operations.ts without it is the interesting failure — and it is the one
        // a clean checkout actually hits. The URL can only come from a generated
        // function, so a real one proves the generated client was present when
        // this was compiled and run.
        const client = createApiClient({ baseUrl: 'https://api.fixmate.test' })

        expect(client.url({ url: '/api/users/signin', method: 'post' })).toBe(
            'https://api.fixmate.test/api/users/signin',
        )
    })
})

describe('the operations a consumer gets from the package name', () => {
    const operations = createOperations(createApiClient({ baseUrl: 'https://api.fixmate.test' }))

    it('exposes one sign-in per account type, not a shared one', () => {
        // Four doors, four operations. A single operation taking an account type
        // as a parameter would let an application ask for a store that is not its
        // own, which is the whole reason the back end has four endpoints.
        for (const name of ['signInUser', 'signInWorker', 'signInAdmin', 'signInSuperAdmin'] as const) {
            expect(typeof operations[name]).toBe('function')
        }
    })

    it('exposes both halves of a password reset for each of them', () => {
        for (const name of [
            'forgotPasswordUser',
            'resetPasswordUser',
            'forgotPasswordWorker',
            'resetPasswordWorker',
            'forgotPasswordAdmin',
            'resetPasswordAdmin',
            'forgotPasswordSuperAdmin',
            'resetPasswordSuperAdmin',
        ] as const) {
            expect(typeof operations[name]).toBe('function')
        }
    })
})
