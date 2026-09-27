import { ApiError, createApiClient, createOperations } from '@fixmate/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    OPERATIONS_BY_APPLICATION,
    createAccessTokenSource,
    createSession,
    memoryRenewalTokenStore,
    type RenewalTokenStore,
} from '../src'
import type { Session, SessionOptions } from '../src'

/**
 * The session layer, tested through a real API client with a fake `fetch`.
 *
 * A hand-written stub for `Operations` would have been easier and would have
 * proved less: the wiring between the session, the client and the declared
 * response shapes is exactly where a session bug lives, and stubbing the client
 * out is stubbing out the thing under test. So these build the real one and
 * control only the network.
 *
 * The clock is injected too. Silent renewal is the feature most likely to rot,
 * and a test that waited fifteen real minutes to prove it would never be
 * written — so `now` and `schedule` are both faked and the scheduled renewal is
 * run by hand.
 */

const BASE_URL = 'https://api.fixmate.test'

/** What `me` answers with. Declared once so the shape is exercised for real. */
const WHO_AM_I = {
    account_type: 'users',
    account: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', status: 'active' },
    abilities: ['users:*'],
}

const ACCESS_EXPIRES_AT = 1_000_000
const RENEWAL_EXPIRES_AT = 9_000_000

/**
 * A sign-in response and a renewal response are *different shapes*, and the
 * first version of this file got that wrong. The client's declared schema
 * refused the fake with "does not match an object (data.token)", which is the
 * clearest possible demonstration that the shapes are load-bearing: a front end
 * that guessed wrong gets told, rather than reading `undefined` at runtime.
 *
 * Sign-in keeps the historical `token` key; renewal is explicit about
 * `access_token`. That asymmetry is the back end's, documented in IssuedTokens.
 */
function signedIn() {
    return {
        data: {
            token: 'access-1',
            user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test' },
            abilities: ['users:*'],
            renewal_token: 'renewal-1',
            access_token_expires_at: new Date(ACCESS_EXPIRES_AT).toISOString(),
            renewal_token_expires_at: new Date(RENEWAL_EXPIRES_AT).toISOString(),
        },
    }
}

function renewed(accessToken = 'access-2', renewalToken = 'renewal-2') {
    return {
        data: {
            access_token: accessToken,
            renewal_token: renewalToken,
            access_token_expires_at: new Date(ACCESS_EXPIRES_AT * 2).toISOString(),
            renewal_token_expires_at: new Date(RENEWAL_EXPIRES_AT).toISOString(),
        },
    }
}

describe('the session layer', () => {
    let requests: { url: string; token: string | null }[]
    let respond: (url: string, token: string | null) => Response
    let clock: number
    let pending: { runAt: number; task: () => void }[]
    let store: RenewalTokenStore
    let session: Session

    /** Build a session whose store and clock the test controls. */
    function build(options: Partial<SessionOptions> = {}): Session {
        return createSession({
            tokens: createAccessTokenSource(),
            operations: {
                signIn: async () => {
                    throw new Error('not stubbed; use the fetch-level tests')
                },
                renew: async () => {
                    throw new Error('not stubbed; use the fetch-level tests')
                },
                signOut: async () => {
                    throw new Error('not stubbed; use the fetch-level tests')
                },
                whoAmI: async () => {
                    throw new Error('not stubbed; use the fetch-level tests')
                },
            },
            store,
            now: () => clock,
            schedule: (runAt, task) => {
                pending.push({ runAt, task })

                return () => {
                    pending = pending.filter((entry) => entry.task !== task)
                }
            },
            ...options,
        })
    }

    /**
     * A session wired to the real client, so the declared response shapes and
     * the error normalisation are genuinely in the path.
     */
    function sessionOverRealClient(): Session {
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            const token =
                (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? null

            requests.push({ url, token: token?.replace('Bearer ', '') ?? null })

            return respond(url, token?.replace('Bearer ', '') ?? null)
        })

        // One source, read by the client and written by the session. This is the
        // wiring the previous version of this file was missing, and its absence
        // was invisible: every request went out with no Authorization header and
        // the tests that only checked the returned state still passed.
        const tokens = createAccessTokenSource()
        const client = createApiClient({
            baseUrl: BASE_URL,
            fetch: fetchMock as unknown as typeof fetch,
            getAccessToken: tokens.get,
        })
        const operations = createOperations(client)

        return createSession({
            tokens,
            operations: {
                signIn: (input) => operations.signInUser(input),
                renew: () => operations.renewSessionUser(),
                signOut: () => operations.signOutUser(),
                whoAmI: () => operations.currentUser(),
            },
            store,
            now: () => clock,
            schedule: (runAt, task) => {
                pending.push({ runAt, task })

                return () => {
                    pending = pending.filter((entry) => entry.task !== task)
                }
            },
        })
    }

    /**
     * The recorded requests to one path.
     *
     * A restore now makes two calls — the renewal and then `me` — so an
     * assertion about "the last request" is an assertion about the wrong thing.
     * Naming the path is what keeps these tests saying what they mean as the
     * session grows another step.
     */
    function requestsTo(path: string) {
        return requests.filter((request) => request.url.includes(path))
    }

    function json(body: unknown, status = 200): Response {
        return new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    beforeEach(() => {
        requests = []
        pending = []
        clock = 0
        store = memoryRenewalTokenStore()
        // A renewal by default, because most of these tests restore rather than
        // sign in. The sign-in tests override it.
        respond = () => json(renewed('access-1', 'renewal-1'))
    })

    // -----------------------------------------------------------------
    // The access token stays in memory
    // -----------------------------------------------------------------

    it('never writes the access token to the store', async () => {
        const writes: string[] = []
        store = {
            kind: 'held-by-client',
            read: () => null,
            write: (token) => writes.push(token),
            clear: () => {},
        }

        session = build({
            operations: {
                signIn: async () => ({
                    token: 'the-access-token',
                    renewal_token: 'the-renewal-token',
                    access_token_expires_at: new Date(1_000_000).toISOString(),
                    renewal_token_expires_at: new Date(9_000_000).toISOString(),
                }),
                renew: async () => {
                    throw new Error('unused')
                },
                signOut: async () => ({ message: 'Signed out.' }),
                whoAmI: async () => ({ ...WHO_AM_I, abilities: [] }),
            },
        })

        await session.signIn('ada@example.test', 'password123')

        expect(session.accessToken()).toBe('the-access-token')
        expect(writes).toEqual(['the-renewal-token'])
        expect(writes).not.toContain('the-access-token')
    })

    it('attaches the access token to API calls and no other token', async () => {
        session = sessionOverRealClient()
        respond = () => json(signedIn())
        respond = () => json(signedIn())

        await session.signIn('ada@example.test', 'password123')

        expect(session.accessToken()).toBe('access-1')
        expect(session.state).toBe('signed-in')
    })

    // -----------------------------------------------------------------
    // Restoring on load
    // -----------------------------------------------------------------

    it('restores a session from a stored renewal token', async () => {
        store = {
            kind: 'held-by-client',
            read: () => 'renewal-from-storage',
            write: () => {},
            clear: () => {},
        }
        session = sessionOverRealClient()

        expect(await session.restore()).toBe(true)
        expect(session.state).toBe('signed-in')
        expect(session.accessToken()).toBe('access-1')
    })

    it('presents the stored renewal token, not the access token, when renewing', async () => {
        store = {
            kind: 'held-by-client',
            read: () => 'renewal-from-storage',
            write: () => {},
            clear: () => {},
        }
        session = sessionOverRealClient()

        await session.restore()

        // The renewal call specifically, and specifically the credential it
        // carried. `me` goes out afterwards with the *access* token, so reading
        // the last request here would have quietly stopped testing this.
        expect(requestsTo('/session/renew')[0]?.token).toBe('renewal-from-storage')
    })

    it('is signed out, not broken, when there is nothing stored', async () => {
        session = sessionOverRealClient()

        expect(await session.restore()).toBe(false)
        expect(session.state).toBe('signed-out')
        // No request at all: with no renewal token there is nothing to ask.
        expect(requests).toEqual([])
    })

    it('does not claim a session ended when there never was one', async () => {
        // Reached on every first page load, so it is the most commonly seen state
        // in the application. Reporting it as an expiry greets a first-time
        // visitor with "your session has ended" — a claim about a session they
        // never had, on the one screen where that is most confusing.
        session = sessionOverRealClient()

        await session.restore()

        expect(session.state).toBe('signed-out')
        expect(session.endedBecause).toBeNull()
    })

    it('does not start two renewals at once', async () => {
        // Two concurrent restores would spend the same single-use token, and
        // whichever lost would see a 401 and sign the person out — a lockout
        // caused by what looks like a harmless double effect.
        store = {
            kind: 'held-by-client',
            read: () => 'renewal-1',
            write: () => {},
            clear: () => {},
        }
        session = sessionOverRealClient()

        const [first, second] = await Promise.all([session.restore(), session.restore()])

        expect(first).toBe(true)
        expect(second).toBe(true)
        // One renewal, not one request: `me` is expected afterwards.
        expect(requestsTo('/session/renew')).toHaveLength(1)
    })

    it('rotates the stored renewal token on every renewal', async () => {
        const writes: string[] = []
        let reads = 0
        store = {
            kind: 'held-by-client',
            read: () => (reads++ === 0 ? 'renewal-1' : 'renewal-1'),
            write: (token) => writes.push(token),
            clear: () => {},
        }
        session = sessionOverRealClient()

        await session.restore()

        expect(writes).toEqual(['renewal-1'])
    })

    // -----------------------------------------------------------------
    // Why a session ended
    // -----------------------------------------------------------------

    it('reports a spent renewal token as expired, and clears it', async () => {
        store = {
            kind: 'held-by-client',
            read: () => 'already-spent',
            write: () => {},
            clear: () => {},
        }
        respond = () => json({ message: 'Unauthenticated.' }, 401)
        session = sessionOverRealClient()

        expect(await session.restore()).toBe(false)
        expect(session.state).toBe('signed-out')
        expect(session.endedBecause).toBe('expired')
    })

    it('reports a suspended account as refused, which is a different thing to say', async () => {
        // The difference is actionable: "sign in again" versus "contact an
        // administrator". Both end the session; only one of them is the person's
        // own doing.
        store = {
            kind: 'held-by-client',
            read: () => 'renewal-1',
            write: () => {},
            clear: () => {},
        }
        respond = () =>
            json({ message: 'Your account has been suspended.' }, 403)
        session = sessionOverRealClient()

        await session.restore()

        expect(session.endedBecause).toBe('refused')
    })

    it('keeps a token the back end refused rather than retrying it', async () => {
        // Keeping it would mean presenting a credential that will never work
        // again on every page load, forever.
        let cleared = false
        store = {
            kind: 'held-by-client',
            read: () => 'renewal-1',
            write: () => {},
            clear: () => {
                cleared = true
            },
        }
        respond = () => json({ message: 'Unauthenticated.' }, 401)
        session = sessionOverRealClient()

        await session.restore()

        expect(cleared).toBe(true)
    })

    it('distinguishes never-signed-in from signed-out', async () => {
        session = build()

        expect(session.state).toBe('unknown')
        expect(session.endedBecause).toBeNull()
    })

    // -----------------------------------------------------------------
    // Signing out
    // -----------------------------------------------------------------

    it('clears local state before the network answers', async () => {
        // The person asked to sign out. A slow or failed request must not leave
        // them apparently signed in.
        session = sessionOverRealClient()
        respond = () => json(signedIn())
        await session.signIn('ada@example.test', 'password123')

        // The back end is unreachable, or broken, or gone. None of that changes
        // what this person asked for.
        respond = () => json({ message: 'Server error.' }, 500)
        await session.signOut()

        expect(session.state).toBe('signed-out')
        expect(session.accessToken()).toBeNull()
    })

    it('treats a 401 from signing out as success', async () => {
        // Signing out twice, or with a token that expired a moment earlier, is
        // the same end state the person asked for.
        store = {
            kind: 'held-by-client',
            read: () => null,
            write: () => {},
            clear: () => {},
        }
        session = sessionOverRealClient()
        respond = () => json({ message: 'Unauthenticated.' }, 401)

        await session.signOut()

        expect(session.state).toBe('signed-out')
        expect(session.endedBecause).toBe('signed-out')
    })

    it('asks the back end to revoke, which is how the other applications are signed out too', async () => {
        // A front end cannot reach into another application's memory, so the
        // only thing that can end a session elsewhere is server-side revocation.
        respond = () => json(signedIn())
        session = sessionOverRealClient()
        await session.signIn('ada@example.test', 'password123')

        respond = () => json({ data: { message: 'Signed out.' } })
        await session.signOut()

        expect(requests.at(-1)?.url).toContain('/api/v1/identity/users/sign-out')
    })

    it('clears the stored renewal token on sign-out', async () => {
        let cleared = false
        store = {
            kind: 'held-by-client',
            read: () => 'renewal-1',
            write: () => {},
            clear: () => {
                cleared = true
            },
        }
        respond = () => json({ data: { message: 'Signed out.' } })
        session = sessionOverRealClient()

        await session.signOut()

        expect(cleared).toBe(true)
    })

    // -----------------------------------------------------------------
    // Silent renewal
    // -----------------------------------------------------------------

    it('renews before the access token expires rather than after', async () => {
        session = sessionOverRealClient()
        respond = () => json(signedIn())
        await session.signIn('ada@example.test', 'password123')

        // Expiry is at t=1,000,000 and the default lead time is a minute, so the
        // renewal is due at 940,000 — before the token is spent, not after.
        const scheduled = pending.at(-1)

        expect(scheduled?.runAt).toBe(1_000_000 - 60_000)
        expect(scheduled?.runAt).toBeLessThan(1_000_000)
    })

    it('renews silently and keeps the session when the scheduled renewal succeeds', async () => {
        session = sessionOverRealClient()
        respond = () => json(signedIn())
        await session.signIn('ada@example.test', 'password123')

        respond = () => json(renewed())

        await pending.at(-1)?.task()

        expect(session.state).toBe('signed-in')
        expect(session.accessToken()).toBe('access-2')
    })

    it('does not report a failed background renewal as an error to the person', async () => {
        // Their token is still valid for its remaining minute. Shouting would put
        // a message in front of somebody whose session is working.
        const errors: unknown[] = []
        session = build({
            operations: {
                signIn: async () => ({
                    token: 'access-1',
                    renewal_token: 'renewal-1',
                    access_token_expires_at: new Date(1_000_000).toISOString(),
                    renewal_token_expires_at: new Date(9_000_000).toISOString(),
                }),
                renew: async () => {
                    throw new ApiError({
                        kind: 'network',
                        message: 'The request failed.',
                        status: 0,
                        code: null,
                        fields: {},
                        retryable: true,
                    })
                },
                signOut: async () => ({ message: 'Signed out.' }),
                whoAmI: async () => ({ ...WHO_AM_I, abilities: [] }),
            },
            onError: (error) => errors.push(error),
        })

        await session.signIn('ada@example.test', 'password123')
        await pending.at(-1)?.task()

        expect(session.state).toBe('signed-out')
        expect(errors).toHaveLength(1)
    })

    it('cancels a scheduled renewal when the session ends', async () => {
        session = build({
            operations: {
                signIn: async () => ({
                    token: 'access-1',
                    renewal_token: 'renewal-1',
                    access_token_expires_at: new Date(1_000_000).toISOString(),
                    renewal_token_expires_at: new Date(9_000_000).toISOString(),
                }),
                renew: async () => {
                    throw new Error('must not run')
                },
                signOut: async () => ({ message: 'Signed out.' }),
                whoAmI: async () => ({ ...WHO_AM_I, abilities: [] }),
            },
        })

        await session.signIn('ada@example.test', 'password123')
        expect(pending).toHaveLength(1)

        await session.signOut()

        // Nothing left to fire, so a renewal cannot resurrect a session that was
        // just ended.
        expect(pending).toHaveLength(0)
    })

    // -----------------------------------------------------------------
    // Observing
    // -----------------------------------------------------------------

    it('tells an observer about every state change', async () => {
        const seen: string[] = []
        store = {
            kind: 'held-by-client',
            read: () => 'renewal-1',
            write: () => {},
            clear: () => {},
        }
        session = sessionOverRealClient()

        session.subscribe((state) => seen.push(state))
        await session.restore()

        expect(seen).toEqual(['restoring', 'signed-in'])
    })

    it('stops telling an observer once it has unsubscribed', async () => {
        const seen: string[] = []
        session = build()

        const stop = session.subscribe((state) => seen.push(state))
        stop()
        await session.signIn('ada@example.test', 'password123').catch(() => {})

        expect(seen).toEqual([])
    })
describe('knowing who the session belongs to', () => {
    it('reads the account after a sign-in', async () => {
        // The shell has to name the live account type and the navigation has to
        // be filtered by ability, and neither the token string nor browser
        // storage carries either. The back end is asked.
        session = sessionOverRealClient()
        respond = (url) => (url.includes('/me') ? json({ data: WHO_AM_I }) : json(signedIn()))

        await session.signIn('ada@example.test', 'password123')

        expect(session.account()).toEqual({
            accountType: 'users',
            name: 'Ada Lovelace',
            email: 'ada@example.test',
            abilities: ['users:*'],
        })
    })

    it('reads the account after a restore, not only after a sign-in', async () => {
        // A reload is the common case, and the one where nothing was typed.
        store = {
            kind: 'held-by-client',
            read: () => 'renewal-1',
            write: () => {},
            clear: () => {},
        }
        session = sessionOverRealClient()
        respond = (url) => (url.includes('/me') ? json({ data: WHO_AM_I }) : json(renewed()))

        await session.restore()

        expect(session.account()?.accountType).toBe('users')
    })

    it('has no account before the back end has answered', () => {
        // Null rather than a guess. The account type is the back end's to decide,
        // and a session layer that filled one in would be labelling itself on
        // trust.
        session = build()

        expect(session.account()).toBeNull()
    })

    it('fails closed when the account cannot be read', async () => {
        // Abilities empty rather than stale, so every ability-scoped section
        // disappears instead of being offered on the strength of an answer from
        // a session that no longer exists.
        session = build({
            operations: {
                signIn: async () => ({
                    token: 'access-1',
                    renewal_token: 'renewal-1',
                    access_token_expires_at: new Date(1_000_000).toISOString(),
                    renewal_token_expires_at: new Date(9_000_000).toISOString(),
                }),
                renew: async () => {
                    throw new Error('unused')
                },
                signOut: async () => ({ message: 'Signed out.' }),
                whoAmI: async () => {
                    throw new ApiError({
                        kind: 'network',
                        message: 'The request failed.',
                        status: 0,
                        code: null,
                        fields: {},
                        retryable: true,
                    })
                },
            },
        })

        await session.signIn('ada@example.test', 'password123')

        expect(session.state).toBe('signed-in')
        expect(session.account()).toBeNull()
    })

    it('forgets the account when the session ends', async () => {
        store = {
            kind: 'held-by-client',
            read: () => 'renewal-1',
            write: () => {},
            clear: () => {},
        }
        session = sessionOverRealClient()
        respond = (url) => (url.includes('/me') ? json({ data: WHO_AM_I }) : json(renewed()))

        await session.restore()
        expect(session.account()).not.toBeNull()

        respond = () => json({ message: 'Unauthenticated.' }, 401)
        await session.restore()

        expect(session.account()).toBeNull()
    })
})
})
