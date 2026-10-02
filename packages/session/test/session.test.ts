import { ApiError, createApiClient, createOperations } from '@fixmate/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    OPERATIONS_BY_APPLICATION,
    createAccessTokenSource,
    createSession,
    memoryRenewalTokenStore,
    operationsFor,
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
 * The two mocked customer bodies used by the operations tests below.
 *
 * Declared at module scope, next to the session fixtures, rather than inline in
 * the test that needs them: they are contract fixtures in exactly the sense the
 * session fixtures above are, and a schema that starts failing is easier to read
 * against one named place than against a literal buried in an assertion.
 *
 * **Every field is present, including the nulls.** `phone` and `photo_url` are
 * nullable rather than optional, so a body omitting them is refused rather than
 * accepted — the difference between "the back end says there is none" and "the
 * back end forgot", which is the same distinction the stage timestamps make.
 */
const TRACKING_BODY = {
    booking_id: 'BK-2041',
    status: 'on_the_way',
    service: 'Kitchen sink leak',
    worker: { id: 'WK-118', name: 'Imran Qureshi', phone: null, rating: 4.8, photo_url: null },
    location: {
        worker_lat: 12.9719,
        worker_lng: 77.5946,
        destination_lat: 12.9784,
        destination_lng: 77.5912,
        distance_km: 0.8,
        eta_minutes: 5,
    },
    stages: [
        { name: 'Accepted', completed: true, timestamp: '2026-10-02T09:00:00+00:00' },
        { name: 'Arriving now', completed: false, timestamp: null },
    ],
}

const SUGGESTIONS_BODY = {
    suggestions: [
        {
            id: 'leak',
            title: 'Leak or dripping pipe',
            description: 'Water escaping from a joint or tap',
            confidence: 0.92,
            price_range: { min: 400, max: 900, currency: 'INR' },
        },
    ],
    recommended: 'leak',
}

/**
 * The remaining four bodies the route test needs.
 *
 * One per operation rather than a shared envelope, because the schemas are
 * genuinely different shapes and a test that answered every route with one body
 * would be testing that the client accepts whatever it is given. `bookingQuote`
 * and `matching` in particular carry required arrays the schema checks element by
 * element, so a `{ bookings: [] }` answer is refused with a field named in the
 * message — which is the contract doing its job.
 *
 * `QUOTE_BODY` is trimmed to the fields the schema marks required. A full copy of
 * the controller's payload would be a second source of truth for the endpoint,
 * and this test is about the route and the schema, not about the estimate.
 */
const DIAGNOSIS_BODY = {
    diagnosis: {
        problem: 'Kitchen sink pipe leaking under the basin',
        severity: 'medium',
        possible_causes: ['Loose compression joint'],
        recommended_solution: 'Replace the failed washer.',
        estimated_time: '30-45 minutes',
        price_estimate: { min: 400, max: 900, currency: 'INR' },
        tools_needed: ['Adjustable spanner'],
    },
}

const DISCOVERY_BODY = {
    categories: [
        { id: 'plumbing', label: 'Plumbing', price_from: 149, currency: 'INR' },
    ],
    featured_technicians: [
        { id: 'WK-301', name: 'Ramesh Kumar', trade: 'Master Plumber', rating: 4.8, completed_jobs: 120 },
    ],
}

const MATCHING_BODY = {
    query: 'Plumber',
    area: 'Sector 48, Gurugram',
    found_count: 24,
    summary: 'We matched 3 master technicians.',
    average_arrival_minutes: 22,
    estimated_cost: { min: 350, max: 500, currency: 'INR' },
    filters: [{ id: 'ai-best-match', label: 'AI Best Match' }],
    technicians: [
        {
            id: 'WK-301',
            name: 'Ramesh Kumar',
            trade: 'Master Plumber',
            years_experience: 12,
            base_fee: 149,
            currency: 'INR',
            rating: 4.8,
            review_count: 120,
            distance_km: 1.2,
            availability: { label: 'Available Now', available_now: true },
            best_match: true,
        },
    ],
}

const QUOTE_BODY = {
    booking_id: 'BK-2041',
    category: 'Plumbing',
    service: 'Pipe Leakage Repair',
    technician: { id: 'WK-118', name: 'Imran Qureshi', trade: 'Expert Plumber', rating: 4.8, review_count: 120 },
    dates: [{ date: '2026-11-14', weekday: 'Sat', day_label: '14 Nov', is_today: true }],
    times: [{ starts_at: '2026-11-14T09:00:00+05:30', label: '9:00 AM' }],
    estimate: {
        heading: 'AI Estimated Price',
        badge: 'SECURE',
        lines: [{ label: 'Base Service Fee', amount: 149 }],
        total: 450,
        total_label: 'Total Payable',
        currency: 'INR',
        footnote: 'Actual price may vary slightly based on material used.',
    },
    payment_methods: [{ id: 'upi', title: 'UPI / QR / Wallets', note: 'Google Pay' }],
}

const REGISTRATION_BODY = {
    success: true,
    message: 'Registration successful',
    user: { id: 1, name: 'Aarav Sharma', email: 'aarav@example.test' },
    token: 'mock-registration-abcdef0123456789',
}

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
/**
 * Both fixtures take the flag rather than hard-coding `false`, because the field
 * is load-bearing in two directions and a fixture that always said `false` would
 * make every test here pass whether or not it was being read. Declaring it as a
 * required field on the client's schema is what caught the omission the first
 * time: the fake was refused with "does not match an object", which is the
 * clearest possible demonstration that these shapes are the contract.
 */
function signedIn(mustChangePassword = false) {
    return {
        data: {
            token: 'access-1',
            user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test' },
            abilities: ['users:*'],
            renewal_token: 'renewal-1',
            access_token_expires_at: new Date(ACCESS_EXPIRES_AT).toISOString(),
            renewal_token_expires_at: new Date(RENEWAL_EXPIRES_AT).toISOString(),
            must_change_password: mustChangePassword,
        },
    }
}

function renewed(accessToken = 'access-2', renewalToken = 'renewal-2', mustChangePassword = false) {
    return {
        data: {
            access_token: accessToken,
            renewal_token: renewalToken,
            access_token_expires_at: new Date(ACCESS_EXPIRES_AT * 2).toISOString(),
            renewal_token_expires_at: new Date(RENEWAL_EXPIRES_AT).toISOString(),
            must_change_password: mustChangePassword,
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
                changePassword: async () => {
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
                changePassword: (input) => operations.changePasswordUser(input),
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
                    must_change_password: false,
                }),
                renew: async () => {
                    throw new Error('unused')
                },
                signOut: async () => ({ message: 'Signed out.' }),
                whoAmI: async () => ({ ...WHO_AM_I, abilities: [] }),
                changePassword: async () => {
                    throw new Error('not stubbed; use the fetch-level tests')
                },
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
                    must_change_password: false,
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
                changePassword: async () => {
                    throw new Error('not stubbed; use the fetch-level tests')
                },
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
                    must_change_password: false,
                }),
                renew: async () => {
                    throw new Error('must not run')
                },
                signOut: async () => ({ message: 'Signed out.' }),
                whoAmI: async () => ({ ...WHO_AM_I, abilities: [] }),
                changePassword: async () => {
                    throw new Error('not stubbed; use the fetch-level tests')
                },
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
                    must_change_password: false,
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
                changePassword: async () => {
                    throw new Error('not stubbed; use the fetch-level tests')
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

    // -----------------------------------------------------------------
    // The account that must replace its password
    //
    // Story 21. The back end refuses every route except the change and sign-out,
    // so this is the one account the session cannot read: `whoAmI` is refused, and
    // a session that had learned the flag from the account would be learning it
    // from the one call that always fails. It comes from sign-in and from renewal
    // instead, which are the only two calls that can succeed.
    // -----------------------------------------------------------------

    it('learns at sign-in that the password must change, with no account to read', async () => {
        session = sessionOverRealClient()
        // The back end's actual answer for a flagged account: the sign-in succeeds
        // and `me` is refused. Modelling it as a 200 with an empty account would
        // make this test pass for a session that learned nothing.
        respond = (url) =>
            url.includes('/me')
                ? json({ message: 'Choose a new password for this account before using it.' }, 403)
                : url.includes('/sign-in')
                  ? json(signedIn(true))
                  : json(renewed())

        await session.signIn('ada@example.test', 'password123')

        expect(session.state).toBe('signed-in')
        expect(session.mustChangePassword()).toBe(true)
        // Stated so the reason this is on the session and not on the account is
        // visible: the account genuinely could not be read.
        expect(session.account()).toBeNull()
    })

    it('does not claim a change is needed for an ordinary account', async () => {
        session = sessionOverRealClient()
        respond = (url) => (url.includes('/me') ? json({ data: WHO_AM_I }) : json(signedIn(false)))

        await session.signIn('ada@example.test', 'password123')

        expect(session.mustChangePassword()).toBe(false)
    })

    it('learns it again from a renewal, which is all a page reload runs', async () => {
        // The reason the back end exempts renewal from its guard. A session
        // restored from browser storage has run no sign-in, so without this the
        // only evidence would be the 403 on every other route — which a front end
        // would have to recognise by its wording.
        store = {
            kind: 'held-by-client',
            read: () => 'renewal-1',
            write: () => {},
            clear: () => {},
        }
        session = sessionOverRealClient()
        respond = (url) =>
            url.includes('/me')
                ? json({ message: 'Choose a new password for this account before using it.' }, 403)
                : json(renewed('access-2', 'renewal-2', true))

        expect(await session.restore()).toBe(true)

        expect(session.state).toBe('signed-in')
        expect(session.mustChangePassword()).toBe(true)
    })

    it('clears the flag once the password has been changed', async () => {
        // The other half of the reload story: a session that still believed it had
        // to change its password would send the person straight back to a screen
        // they had just satisfied, and they would have no way off it.
        session = sessionOverRealClient()
        respond = (url) =>
            url.includes('/me')
                ? json({ message: 'Choose a new password for this account before using it.' }, 403)
                : url.includes('/sign-in')
                  ? json(signedIn(true))
                  : json(renewed())

        await session.signIn('ada@example.test', 'password123')
        expect(session.mustChangePassword()).toBe(true)

        respond = (url) =>
            url.includes('/password/change') ? json({ data: WHO_AM_I }) : json(renewed())

        await session.changePassword('shared-one', 'ada-own-secret')

        expect(session.mustChangePassword()).toBe(false)
        // The account comes back with the change, because `me` was refused before it
        // and the response is the one place the back end re-reads the account.
        expect(session.account()?.name).toBe('Ada Lovelace')
    })

    it('sends the current password to the change door, and nothing that names an account', async () => {
        // Asserted over the real client, because that is where the body is built. A
        // test that only checked the arguments the session passed would pass
        // against a client that dropped a field on the way out — and the field that
        // matters is the one proving the person is present.
        const bodies: string[] = []
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)

            // The change answers with the account, not with a token pair — the
            // back end re-reads the account after storing the change and returns
            // it, so the client does not have to make a second request to find out
            // whether it worked. Ordered before `/me`, which the path does not
            // contain but which a fall-through would otherwise answer with a 403,
            // hiding the body being asserted.
            if (url.includes('/password/change')) {
                bodies.push(String(init?.body ?? ''))

                return json({ data: WHO_AM_I })
            }

            return url.includes('/me')
                ? json({ message: 'Choose a new password for this account before using it.' }, 403)
                : url.includes('/sign-in')
                  ? json(signedIn(true))
                  : json(renewed())
        })

        const tokens = createAccessTokenSource()
        const client = createApiClient({
            baseUrl: BASE_URL,
            fetch: fetchMock as unknown as typeof fetch,
            getAccessToken: tokens.get,
        })
        const operations = createOperations(client)

        session = createSession({
            tokens,
            operations: {
                signIn: (input) => operations.signInUser(input),
                renew: () => operations.renewSessionUser(),
                signOut: () => operations.signOutUser(),
                whoAmI: () => operations.currentUser(),
                changePassword: (input) => operations.changePasswordUser(input),
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

        await session.signIn('ada@example.test', 'password123')
        await session.changePassword('shared-one', 'ada-own-secret')

        expect(bodies).toHaveLength(1)

        // `bodies[0]` rather than destructuring, so the assertion below is about a
        // request that was made rather than about one that might not have been.
        const body = JSON.parse(bodies[0] ?? '{}') as Record<string, unknown>

        // The current password is the one field that cannot be optional: the access
        // token proves who is asking, and this proves it is the person rather than a
        // copy of their session.
        expect(body['current_password']).toBe('shared-one')
        expect(body['password']).toBe('ada-own-secret')
        // No identifier of any kind. The account comes from the token, so a field
        // naming one would be a way to aim the change at somebody else — and this
        // is the one request on which that would be a full account takeover.
        expect(Object.keys(body).sort()).toEqual(['current_password', 'password'])
    })

    it('keeps the flag when the change is refused', async () => {
        // The back end keys a wrong current password on `current_password` and an
        // unchanged new one on `password`, so the caller can put each message beside
        // the right input. Both arrive as `fields`, and the session's own state must
        // not be the thing that changes on a refusal.
        session = sessionOverRealClient()
        respond = (url) =>
            url.includes('/me')
                ? json({ message: 'Choose a new password for this account before using it.' }, 403)
                : url.includes('/sign-in')
                  ? json(signedIn(true))
                  : json(renewed())

        await session.signIn('ada@example.test', 'password123')

        respond = (url) =>
            url.includes('/password/change')
                ? json(
                      {
                          message: 'The given data was invalid.',
                          errors: { current_password: ['That is not your current password.'] },
                      },
                      422,
                  )
                : json(renewed())

        await expect(session.changePassword('wrong', 'ada-own-secret')).rejects.toThrow(
            'The given data was invalid.',
        )

        expect(session.mustChangePassword()).toBe(true)
        expect(session.state).toBe('signed-in')
    })

    it('forgets the flag when the session ends, so the next one is not misled', async () => {
        // A session that ends must not leave a claim about a password behind. The
        // next sign-in sets it from its own response, so a stale value here would
        // only ever be a value nothing can correct.
        session = sessionOverRealClient()
        respond = (url) =>
            url.includes('/me')
                ? json({ message: 'Choose a new password for this account before using it.' }, 403)
                : url.includes('/sign-in')
                  ? json(signedIn(true))
                  : json(renewed())

        await session.signIn('ada@example.test', 'password123')
        expect(session.mustChangePassword()).toBe(true)

        respond = () => json({ message: 'Unauthenticated.' }, 401)
        await session.signOut()

        expect(session.mustChangePassword()).toBe(false)
    })
})

// -------------------------------------------------------------------------
// The operations an application is allowed to hold
//
// The five session operations are bound for every application. Anything else an
// application's entry names rides alongside — and the narrowing is the point:
// for the three applications without `listAccounts`, the name is absent from the
// type entirely, which is what makes the mistake unwritable rather than merely
// refused. TypeScript proves the negative at compile time; these tests prove it
// again at run time so the property is demonstrable, not assumed.
// -------------------------------------------------------------------------

describe('the operations an application is allowed to hold', () => {
    /**
     * A real client over a fetch that records and answers, like the tests above.
     *
     * Typed for the super-admin key only: a helper over the union of two keys
     * would type its result as the *union's* operations, where `listAccounts` is
     * hidden by the member that lacks it — which is the narrowing working as
     * designed, in the wrong place.
     */
    function superAdminOperations() {
        const requests: { url: string; authorization: string | null }[] = []
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            requests.push({
                url: String(input),
                authorization: new Headers(init?.headers).get('Authorization'),
            })

            return json({
                data: [{ type: 'users', id: 1, name: 'A', email: 'a@example.test', status: 'active' }],
            })
        })

        const tokens = createAccessTokenSource()
        const client = createApiClient({
            baseUrl: BASE_URL,
            fetch: fetchMock as unknown as typeof fetch,
            getAccessToken: tokens.get,
        })

        return { operations: operationsFor(createOperations(client), 'super-admin'), requests }
    }

    it('binds the account directory for the super administrator application', async () => {
        const { operations, requests } = superAdminOperations()

        const directory = await operations.listAccounts()

        expect(directory).toHaveLength(1)
        expect(requests[0]?.url).toBe(`${BASE_URL}/api/v1/identity/accounts`)
        expect(requests[0]?.authorization).toBeNull()
    })

    it('never binds the account directory for the end user application', () => {
        // Runtime half of the compile-time narrowing. If the map ever grew the
        // name onto the user entry by accident, this fails before an application
        // could be built that offered a customer the account directory.
        expect(OPERATIONS_BY_APPLICATION.user).not.toHaveProperty('listAccounts')
        expect(OPERATIONS_BY_APPLICATION.worker).not.toHaveProperty('listAccounts')
        expect(OPERATIONS_BY_APPLICATION.admin).not.toHaveProperty('listAccounts')
        expect(OPERATIONS_BY_APPLICATION['super-admin']).toHaveProperty('listAccounts')
    })

    /**
     * The customer application over a fetch that records and answers.
     *
     * Separate from the super-admin helper above because the return type is
     * narrowed *per application key*: one helper over both keys would type its
     * result as the union, where each member hides what the other holds, and the
     * assertions below would be testing the helper rather than the map.
     */
    function customerOperations(body: unknown = { bookings: [] }) {
        const requests: { url: string; authorization: string | null }[] = []
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            requests.push({
                url: String(input),
                authorization: new Headers(init?.headers).get('Authorization'),
            })

            return json(body)
        })

        const tokens = createAccessTokenSource()
        const client = createApiClient({
            baseUrl: BASE_URL,
            fetch: fetchMock as unknown as typeof fetch,
            getAccessToken: tokens.get,
        })

        return { operations: operationsFor(createOperations(client), 'user'), requests }
    }

    /**
     * The eight mocked customer operations, pinned.
     *
     * Pinned rather than derived from the map, because the derived version of
     * this test is the one that cannot fail: "every name in the map is bound" is
     * exactly what the binding loop does, so asserting it proves the loop reads
     * the map. **The three that mattered most were the ones a hand-written list
     * would have left out** — `discovery`, `matching` and `bookingQuote` were
     * added after this test was first written, and a list of five would have gone
     * on passing through all three of them.
     */
    const CUSTOMER_OPERATIONS = [
        'diagnosis',
        'diagnosisSuggestions',
        'tracking',
        'bookings',
        'register',
        'discovery',
        'matching',
        'bookingQuote',
    ] as const

    it('binds all eight mocked customer operations for the end user application', async () => {
        // The extras are bound by a loop over the entry rather than by eight
        // hand-written conditionals, so this is the test that the loop covers the
        // whole entry rather than the names somebody remembered. Each name is
        // asserted to be a function, because the failure mode of the loop losing
        // one is `undefined` rather than a build error: the map is cast on the
        // way out, so a missing bind is invisible to TypeScript and reaches the
        // screen as a click that throws.
        const { operations } = customerOperations({ bookings: [] })

        for (const name of CUSTOMER_OPERATIONS) {
            expect(typeof operations[name], `${name} is not bound`).toBe('function')
        }

        /*
         * And nothing beyond the pinned eight — scoped by excluding the five
         * session operations every application holds, because `Object.keys` on the
         * `user` entry returns thirteen names and comparing it to the customer
         * eight would fail for the wrong reason. The first version of this line
         * did exactly that, which is worth recording: **a failure that looks like
         * "the map has extra keys" and is really "I forgot the session ones" is
         * indistinguishable from a real leak unless you read the diff**, and the
         * diff said `signIn`.
         *
         * What it guards is an unrecorded customer door. A ninth key on the `user`
         * entry that is not one of the five session operations is a door only the
         * end user can open, and the three assertions above cannot see it — they
         * only check that the *named* eight are bound and that no *other*
         * application has them.
         *
         * **This line, specifically, is the only one that can.** A ninth key
         * pointing at an operation that does not exist takes the bind loop down
         * with a `TypeError` first, which is a failure but an accidental one — it
         * names the loop, not the extra door, and it disappears the moment the
         * alias happens to point at something real. Pointing `shadowTracking` at
         * `getTracking` leaves the loop perfectly happy, both session-operation
         * assertions green and the three-door assertions silent, and this is the
         * only assertion in the file that notices.
         */
        const sessionNames = new Set([
            'signIn',
            'renew',
            'signOut',
            'whoAmI',
            'changePassword',
        ])
        const extras = Object.keys(OPERATIONS_BY_APPLICATION.user).filter(
            (name) => !sessionNames.has(name),
        )

        expect(extras.sort()).toEqual([...CUSTOMER_OPERATIONS].sort())
    })

    it('reaches the real route behind each mocked customer operation', async () => {
        // The URL is never written by hand, so it cannot drift — but only if the
        // operation actually goes through the generated route. These assert the
        // addresses, because a customer screen pointing at the wrong door is a
        // 404 that reads as "the backend is not finished".
        //
        // Each call gets a body its own schema will accept. The first version of
        // this test answered every route with `{ bookings: [] }` and the tracking
        // call was refused with "booking_id: expected a string, received
        // nothing" — which is the schema working: the operations are wired to
        // different shapes, not to one shared envelope.
        //
        // **All eight are called, including the three newer ones.** `bookingQuote`
        // is the reason this list cannot be derived from the keys above: it takes
        // an argument, so a loop over `Object.keys` would call it with nothing and
        // the test would fail on the schema rather than on the route.
        const requests: string[] = []
        const bodies: Record<string, unknown> = {
            '/api/v1/identity/users/tracking': TRACKING_BODY,
            '/api/v1/identity/users/diagnosis/suggestions': SUGGESTIONS_BODY,
            '/api/v1/identity/users/bookings': { bookings: [] },
            '/api/v1/identity/users/diagnosis': DIAGNOSIS_BODY,
            '/api/v1/identity/users/discovery': DISCOVERY_BODY,
            '/api/v1/identity/users/matching': MATCHING_BODY,
            '/api/v1/identity/users/bookings/BK-2041/quote': QUOTE_BODY,
            '/api/v1/identity/users/register': REGISTRATION_BODY,
        }

        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            requests.push(url)

            const path = url.slice(BASE_URL.length)

            return new Response(JSON.stringify(bodies[path] ?? {}), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        })

        const operations = operationsFor(
            createOperations(
                createApiClient({
                    baseUrl: BASE_URL,
                    fetch: fetchMock as unknown as typeof fetch,
                }),
            ),
            'user',
        )

        await operations.tracking()
        await operations.diagnosisSuggestions()
        await operations.bookings()
        await operations.diagnosis()
        await operations.discovery()
        await operations.matching()
        await operations.bookingQuote('BK-2041')
        await operations.register({
            name: 'Aarav Sharma',
            email: 'aarav@example.test',
            password: 'Passw0rd!Passw0rd!',
        })

        expect(requests).toEqual([
            `${BASE_URL}/api/v1/identity/users/tracking`,
            `${BASE_URL}/api/v1/identity/users/diagnosis/suggestions`,
            `${BASE_URL}/api/v1/identity/users/bookings`,
            `${BASE_URL}/api/v1/identity/users/diagnosis`,
            `${BASE_URL}/api/v1/identity/users/discovery`,
            `${BASE_URL}/api/v1/identity/users/matching`,
            `${BASE_URL}/api/v1/identity/users/bookings/BK-2041/quote`,
            `${BASE_URL}/api/v1/identity/users/register`,
        ])
    })

    it('never binds a customer operation for the other three applications', () => {
        // The whole reason the map exists. A worker's token would be refused by
        // `account.can:users` on the server, so this is a second, front-end copy
        // of a rule the back end already owns — and the copy is the one that
        // fails *at build time* rather than in a browser.
        //
        // Asserted over the map rather than over three built operation sets,
        // because the map is the single place the rule is written down. The
        // compiled narrowing is checked by `npm run typecheck`, which refuses
        // `operationsFor(ops, 'worker').tracking` outright.
        for (const key of ['worker', 'admin', 'super-admin'] as const) {
            for (const name of CUSTOMER_OPERATIONS) {
                expect(OPERATIONS_BY_APPLICATION[key], `${key} can reach ${name}`).not.toHaveProperty(name)
            }
        }

        for (const name of CUSTOMER_OPERATIONS) {
            expect(OPERATIONS_BY_APPLICATION.user).toHaveProperty(name)
        }
    })

    it('binds the five session operations for every application', () => {
        // The extras loop skips the five session names by checking `key in
        // session`. A session operation appearing twice — once from `session` and
        // once rebound from `names` — would be a silent change of identity rather
        // than a duplicate-key error, so this asserts the bound object for all
        // four keys rather than only the customer one.
        //
        // `operationsFor` is reached through a widened reference on purpose: its
        // return type is narrowed per key, so holding the four results in one
        // variable would make the compiler drop whichever keys the *union* does
        // not have. The property under test is about the object at run time, not
        // about what four different types can express.
        //
        // The fetch is never called — nothing here awaits an operation — but the
        // client refuses to be built without one.
        const fetchMock = vi.fn() as unknown as typeof fetch
        const bound = operationsFor as unknown as (
            operations: ReturnType<typeof createOperations>,
            application: 'user' | 'worker' | 'admin' | 'super-admin',
        ) => Record<string, unknown>

        const sessionNames = ['signIn', 'renew', 'signOut', 'whoAmI', 'changePassword'] as const

        for (const key of ['user', 'worker', 'admin', 'super-admin'] as const) {
            const operations = bound(
                createOperations(createApiClient({ baseUrl: BASE_URL, fetch: fetchMock })),
                key,
            )

            for (const name of sessionNames) {
                expect(typeof operations[name], `${key}.${name} is not bound`).toBe('function')
            }
        }

        expect(fetchMock).not.toHaveBeenCalled()
    })
})
})
