import { ApiError } from '@fixmate/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccessTokenSource, createSession, memoryRenewalTokenStore } from '../src'
import type { Session, SessionEndReason, SessionOptions, SessionState } from '../src'
import { reportUserActivity } from '../src/react/report-user-activity'

/**
 * Story 12: a session ends after a period of nobody using the page.
 *
 * The rule did not exist, and what was there instead was the *opposite* of it.
 * Renewal was the only clock in the session and a timer fires whether or not
 * anybody is there, so an open tab on an unattended machine minted access tokens
 * all day. A person who closed their laptop expecting to be signed out was not.
 *
 * Every test here drives a fake clock and runs the scheduled callbacks by hand.
 * Ten real minutes is not a thing a test can wait for, and a suite that cannot
 * run this rule is a suite that will not notice it being removed.
 */

const IDLE = 10 * 60 * 1000
const ACCESS_EXPIRES_AT = 1_300_000
const FIFTEEN_MINUTES = 15 * 60 * 1000
const RENEWAL_EXPIRES_AT = 9_000_000

const WHO_AM_I = {
    account_type: 'users',
    account: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', status: 'active' },
    abilities: ['users:*'],
}

describe('a session with nobody using it', () => {
    let clock: number
    let pending: { runAt: number; task: () => void }[]
    let store: ReturnType<typeof memoryRenewalTokenStore>
    let session: Session
    let signOutCalls: number
    let renewals: number
    /**
     * When the access token handed out by sign-in and by each renewal stops being
     * accepted.
     *
     * Mutable because two tests need different windows, and the difference is the
     * point of both. Most tests want a renewal to happen *inside* the idle window,
     * because surviving one is the interesting case. The test for activity
     * refreshing the deadline needs the opposite: a window with no renewal in it at
     * all, or the renewal re-arms the deadline and hides the behaviour under test.
     */
    let accessExpiresAt: number

    function build(options: Partial<SessionOptions> = {}): Session {
        return createSession({
            tokens: createAccessTokenSource(),
            operations: {
                signIn: async () => signedIn(accessExpiresAt),
                renew: async () => renewed(++renewals, accessExpiresAt),
                signOut: async () => {
                    signOutCalls += 1

                    return { message: 'Signed out.' }
                },
                whoAmI: async () => WHO_AM_I,
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
     * Run the callbacks due at or before `at`, earliest deadline first.
     *
     * Ordered by `runAt` and not by insertion, which is the second version of this
     * helper to be wrong in a way that only showed up as a mysteriously green
     * suite. `pending` holds the renewal and the idle check together; taking the
     * first *due* entry in insertion order meant a renewal that rescheduled itself
     * into the past ran again and again, never letting the idle check be reached,
     * and the guard loop ran out before the session had ended.
     *
     * The bound is there to stop an accidental infinite reschedule hanging the
     * suite, and it is high enough for the two real schedules to interleave.
     */
    async function runScheduled(at: number): Promise<void> {
        for (let guard = 0; guard < 50; guard += 1) {
            const due = pending
                .filter((entry) => entry.runAt <= at)
                .sort((left, right) => left.runAt - right.runAt)
            if (due.length === 0) return

            const entry = due[0]!
            pending = pending.filter((candidate) => candidate !== entry)
            await entry.task()
        }

        throw new Error('runScheduled did not settle: something is rescheduling itself')
    }

    /**
     * The instant the session was established, which is what the first idle
     * deadline is measured from.
     *
     * Captured rather than recomputed from `clock`, because the whole point of the
     * assertions below is that the deadline does *not* follow the clock — asking
     * "is the deadline now-plus-ten-minutes" would pass for exactly the behaviour
     * under test.
     */
    let sessionStartedAt = 0

    /**
     * The armed idle deadline, or undefined if none is.
     *
     * Found by its value rather than by identity, because `schedule` hands back an
     * opaque cancel function and there is no handle to tell the idle check apart
     * from the renewal. The renewal is a minute before the access token expires,
     * which is a different number.
     */
    function idleDeadline(): number | undefined {
        return pending.find((entry) => entry.runAt === sessionStartedAt + IDLE)?.runAt
    }

    async function signedInSession(options: Partial<SessionOptions> = {}): Promise<Session> {
        const created = build(options)
        await created.signIn('ada@example.test', 'a-password')
        sessionStartedAt = clock

        return created
    }

    beforeEach(() => {
        clock = 1_000_000
        pending = []
        signOutCalls = 0
        renewals = 0
        accessExpiresAt = ACCESS_EXPIRES_AT
        store = memoryRenewalTokenStore()
        store.write('renewal-1')
    })

    it('ends the session once the idle timeout passes with no interaction', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        expect(session.state).toBe('signed-in')

        clock += IDLE
        await runScheduled(clock)

        expect(session.state).toBe('signed-out')
        expect(session.endedBecause).toBe('idle')
    })

    it('does not end it early', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        // One millisecond short. A deadline that fires early is worse than none: a
        // person in the middle of something is signed out for no reason, and the
        // only way to tell that from a bug is to reproduce the timing.
        clock += IDLE - 1
        await runScheduled(clock)

        expect(session.state).toBe('signed-in')
    })

    it('pushes the deadline back when somebody uses the page', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        clock += IDLE - 1
        session.noteActivity()
        clock += IDLE - 1
        await runScheduled(clock)

        expect(session.state).toBe('signed-in')

        clock += 2
        await runScheduled(clock)

        expect(session.state).toBe('signed-out')
        expect(session.endedBecause).toBe('idle')
    })

    it('measures the deadline from the last interaction, not from signing in', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        // Five minutes of being signed in and being used.
        for (let minute = 0; minute < 5; minute += 1) {
            clock += 60_000
            session.noteActivity()
        }

        // A further full idle window from the last of those.
        clock += IDLE
        await runScheduled(clock)

        expect(session.state).toBe('signed-out')

        // So the total lifetime was fifteen minutes, not ten. If the deadline were
        // measured from sign-in this would have ended at ten.
        expect(clock).toBe(1_000_000 + 5 * 60_000 + IDLE)
    })

    it('discards the stored renewal token, so a reload does not sign them back in', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        clock += IDLE
        await runScheduled(clock)

        // The point of the rule. A local sign-out that left the renewal token in
        // browser storage would be undone by the next page load, and the
        // unattended device would be signed in again the moment it woke.
        expect(store.read()).toBeNull()
        expect(session.accessToken()).toBeNull()
    })

    it('ends the session locally and does not revoke anything at the back end', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        clock += IDLE
        await runScheduled(clock)

        // Revoking is what signing out does, and it revokes *every* token the
        // account holds. An idle timeout on one tab would then sign a person out of
        // the application they are actively working in on another. The stolen-token
        // risk this leaves is bounded by the renewal token's own lifetime, which is
        // the smaller problem.
        expect(signOutCalls).toBe(0)
    })

    it('ends the session even when a backgrounded tab runs the timer late', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        // A hidden tab has its timers throttled, and a sleeping machine fires them
        // all on wake, so the callback can arrive an hour after the deadline it was
        // armed for. Being late must still end the session — which is why the
        // callback acts whenever it runs rather than comparing against `runAt`.
        clock += IDLE + 60 * 60 * 1000
        await runScheduled(clock)

        expect(session.state).toBe('signed-out')
        expect(session.endedBecause).toBe('idle')
    })

    it('does not let a successful renewal restart the idle clock', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        const armedAtSignIn = idleDeadline()
        expect(armedAtSignIn).toBe(sessionStartedAt + IDLE)

        // Nine minutes of quiet, then the renewal that a timer-only design would
        // have treated as a sign of life.
        clock += 9 * 60_000
        await runScheduled(clock)

        expect(session.state).toBe('signed-in')

        // Asserted on the *deadline*, not on the end state.
        //
        // The first version of this test advanced the clock past the deadline and
        // checked that the session had ended - which passes whether or not the
        // renewal moved the deadline, because far enough past it the idle check
        // fires either way. The mutation it was written for, resetting
        // `lastActivityAt` on every renewal, was applied and the suite stayed
        // green. A test that cannot tell the two designs apart is not a test.
        expect(idleDeadline()).toBe(armedAtSignIn)
    })

    it('ends the session on the original schedule despite a renewal', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        const armedAtSignIn = idleDeadline()

        clock += 9 * 60_000
        await runScheduled(clock)
        expect(session.state).toBe('signed-in')

        // The deadline never moved, so it arrives ten minutes after sign-in rather
        // than ten minutes after the last renewal. Resetting it here is the exact
        // failure this rule exists to prevent, and it is invisible from outside:
        // every renewal succeeds, so the session looks healthy throughout.
        clock = armedAtSignIn!
        await runScheduled(clock)

        expect(session.state).toBe('signed-out')
        expect(session.endedBecause).toBe('idle')
    })

    it('is off unless a timeout is asked for', async () => {
        // Deliberately not defaulted. An application that has not opted in does not
        // get the rule, so nobody's measured behaviour changes underneath them.
        session = await signedInSession()

        // Past the point where the rule would have fired, rather than a day later.
        // A day is 96 renewals of a fifteen-minute token, which tests the renewal
        // loop rather than this, and the first version of this test spent its time
        // there — rescheduling itself into a state where nothing could settle.
        clock += IDLE + 60_000
        await runScheduled(clock)

        expect(session.state).toBe('signed-in')
    })

    it('leaves no timer armed once the session has ended', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        // Two timers are running: the renewal and the idle check. Both belong to a
        // session that is about to stop existing.
        expect(pending).toHaveLength(2)

        // Ended by signing out, *not* by the idle check firing.
        //
        // That detail is the whole test. When the idle check is what ends the
        // session, the harness has already taken it off the schedule before the
        // task runs, so `forget` cancelling it changes nothing observable — and the
        // "exactly once" test passes with the cancellation deleted, because the
        // callback's own `lastActivityAt` guard refuses the second firing. Two
        // independent guards, either of which hides the other's removal.
        //
        // Signing out leaves the idle timer armed, so the cancellation is the only
        // thing that can clear it.
        await session.signOut()

        expect(session.state).toBe('signed-out')
        expect(pending).toHaveLength(0)
    })

    it('cancels the idle check when a renewal fails', async () => {
        const failing = build({
            idleTimeoutMs: IDLE,
            operations: {
                signIn: async () => signedIn(accessExpiresAt),
                renew: async () => {
                    // A 401 is the shape a spent or expired renewal token produces,
                    // and it is the case that ends a session on its own rather than
                    // by a person asking.
                    throw new ApiError({
                        kind: 'unauthenticated',
                        message: 'Your session has ended.',
                        status: 401,
                        code: null,
                        fields: {},
                        retryable: false,
                    })
                },
                signOut: async () => ({ message: 'Signed out.' }),
                whoAmI: async () => WHO_AM_I,
            },
        })

        await failing.signIn('ada@example.test', 'a-password')
        expect(pending).toHaveLength(2)

        // The other way a session ends on its own: the renewal is refused, so
        // `forget` runs with the idle timer still armed and nothing else to clear
        // it.
        clock += IDLE
        await runScheduled(clock)

        expect(failing.state).toBe('signed-out')
        expect(pending).toHaveLength(0)
    })

    it('keeps a session alive on repeated activity with no renewal in between', async () => {
        // An hour-long token, so no renewal is due for the whole test. Without
        // this, the renewal re-arms the idle deadline through `establish` and hides
        // whatever `noteActivity` does - which is exactly how the first version of
        // this test managed to stay green with `scheduleIdleCheck` deleted from
        // `noteActivity` altogether.
        accessExpiresAt = 1_000_000 + 60 * 60 * 1000
        session = await signedInSession({ idleTimeoutMs: IDLE })

        // Nine minutes of quiet punctuated by use every two minutes. Each use must
        // push the deadline out; if it only recorded the time, the original
        // deadline would arrive, find the gap too small, and do nothing at all —
        // leaving the session alive but with nothing scheduled, which is worse
        // than either behaviour: it would never end.
        for (let elapsed = 0; elapsed < 9 * 60_000; elapsed += 2 * 60_000) {
            clock += 2 * 60_000
            session.noteActivity()
        }

        expect(pending.length).toBeGreaterThan(0)

        // A millisecond inside the deadline that the *last* use set, which is well
        // past the one armed at sign-in. Exactly `IDLE` is the deadline, not before
        // it — the first version of this test advanced by `IDLE` and then asserted
        // the session was still alive, which it should not have been.
        clock += IDLE - 1
        await runScheduled(clock)

        expect(session.state).toBe('signed-in')

        // And it does still end, once the use stops.
        clock += 2
        await runScheduled(clock)

        expect(session.state).toBe('signed-out')
        expect(session.endedBecause).toBe('idle')
    })

    it('arms no second timer when the rule is off', async () => {
        // The observable difference, and the one that matters: without the rule the
        // session schedules exactly one thing, the renewal. A default would add a
        // second timer that fires and does nothing visible, and "it does nothing
        // visible" is not the same as "it is not there".
        session = await signedInSession()

        expect(pending).toHaveLength(1)
        expect(idleDeadline()).toBeUndefined()
    })

    it('treats a zero timeout as off rather than as immediately idle', async () => {
        session = await signedInSession({ idleTimeoutMs: 0 })

        clock += 60_000
        await runScheduled(clock)

        expect(session.state).toBe('signed-in')
    })

    it('starts the idle clock at sign-in, not at the last activity before it', async () => {
        session = build({ idleTimeoutMs: IDLE })

        // Somebody typing on the sign-in screen, then walking away from the machine
        // for a long time before actually signing in.
        clock += 60_000
        session.noteActivity()
        clock += 8 * 60 * 60 * 1000

        await session.signIn('ada@example.test', 'a-password')
        expect(session.state).toBe('signed-in')

        // A whole idle window from signing in, and the session is still here.
        //
        // This is the consequence of `noteActivity` recording a time while signed
        // out: `establish` only starts the clock when there is not one already, so
        // a stale timestamp from the sign-in screen would be adopted and the
        // deadline would be in the past. The person would be signed out moments
        // after signing in, on a machine where they had just proved they were there.
        clock += IDLE - 1
        await runScheduled(clock)

        expect(session.state).toBe('signed-in')

        clock += 2
        await runScheduled(clock)

        expect(session.state).toBe('signed-out')
    })

    it('ignores interaction while there is no session', async () => {
        session = build({ idleTimeoutMs: IDLE })

        // Somebody typing on the sign-in screen. Arming a deadline here would make
        // the page where they are not yet signed in the thing that keeps a session
        // alive.
        clock += 60_000
        session.noteActivity()

        expect(session.state).not.toBe('signed-in')
        expect(pending.some((entry) => entry.runAt === clock + IDLE)).toBe(false)
    })

    it('ends the session exactly once', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        const seen: [SessionState, SessionEndReason | null][] = []
        session.subscribe((state, reason) => seen.push([state, reason]))

        clock += IDLE
        await runScheduled(clock)

        // The renewal timer, the idle timer and a second pass over both. If any of
        // them outlived the session, a sign-in screen would be told the session
        // ended twice, the second time for a session that was already gone.
        await runScheduled(clock)
        await runScheduled(clock + 60 * 60 * 1000)

        expect(seen.filter(([state]) => state === 'signed-out')).toHaveLength(1)
    })

    it('tells observers the reason, so a screen can explain itself', async () => {
        session = await signedInSession({ idleTimeoutMs: IDLE })

        const reasons: (SessionEndReason | null)[] = []
        session.subscribe((_state, reason) => reasons.push(reason))

        clock += IDLE
        await runScheduled(clock)

        // 'idle' and not 'expired': both mean "come back", but only one of them
        // explains why a page somebody was looking at signed them out.
        expect(reasons).toContain('idle')
    })
})

describe('reporting real interaction', () => {
    function fakeTarget() {
        const listeners = new Map<string, Set<(event?: unknown) => void>>()

        return {
            listeners,
            target: {
                addEventListener: (event: string, handler: (event?: unknown) => void) => {
                    if (!listeners.has(event)) listeners.set(event, new Set())
                    listeners.get(event)!.add(handler)
                },
                removeEventListener: (event: string, handler: (event?: unknown) => void) => {
                    listeners.get(event)?.delete(handler)
                },
            },
            fire: (event: string) => {
                for (const handler of listeners.get(event) ?? []) handler()
            },
            count: (event: string) => listeners.get(event)?.size ?? 0,
        }
    }

    it('reports a deliberate interaction', () => {
        const noteActivity = vi.fn()
        const { target, fire } = fakeTarget()

        reportUserActivity({ noteActivity }, target)

        for (const event of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
            fire(event)
        }

        expect(noteActivity).toHaveBeenCalledTimes(4)
    })

    it.each(['mousemove', 'scroll', 'visibilitychange'])(
        'ignores %s, which a machine can produce with nobody in front of it',
        (event) => {
            const noteActivity = vi.fn()
            const { target, fire, count } = fakeTarget()

            reportUserActivity({ noteActivity }, target)
            fire(event)

            // A sleeve brushing a mouse, a trackpad still gliding, a page scrolling
            // itself: each of these holds a session open on an unattended machine,
            // which is the case the rule exists to catch. A tab being hidden is the
            // same idea — the tab you leave open longest would be the one that stays
            // signed in.
            expect(noteActivity).not.toHaveBeenCalled()
            expect(count(event)).toBe(0)
        },
    )

    it('detaches every listener it attached', () => {
        const noteActivity = vi.fn()
        const { target, fire, count } = fakeTarget()

        const stop = reportUserActivity({ noteActivity }, target)
        stop()
        fire('pointerdown')

        expect(noteActivity).not.toHaveBeenCalled()
        for (const event of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
            expect(count(event)).toBe(0)
        }
    })

    it('can be attached and detached more than once without leaking', () => {
        // React strict mode mounts, unmounts and remounts on purpose. A helper that
        // could only be called once would leave the first set of listeners attached
        // and call noteActivity twice per interaction.
        const noteActivity = vi.fn()
        const { target, fire } = fakeTarget()

        for (let i = 0; i < 3; i += 1) {
            reportUserActivity({ noteActivity }, target)()
        }
        reportUserActivity({ noteActivity }, target)
        fire('keydown')

        expect(noteActivity).toHaveBeenCalledTimes(1)
    })
})

/**
 * The shapes `createSession` consumes, which are the shapes the *operations* layer
 * hands it — not the `{ data: ... }` envelope the HTTP client wraps them in.
 *
 * The first version of this file returned the wrapped shape, and every test in it
 * passed anyway. `signIn` read `result.token` as undefined and stored undefined;
 * `renew` set the expiry to `Date.parse(undefined)` = NaN, which scheduled nothing
 * at all because `NaN <= anything` is false. So the renewal the idle rule is
 * supposed to survive never actually renewed, and a mutation that reset the idle
 * clock on renewal went undetected. A test can be green because the code under it
 * did nothing.
 *
 * The envelope is the real client's business and is exercised in session.test.ts
 * through the real client; here the operations are the seam, so they return what
 * the seam returns.
 */
function signedIn(accessExpiresAt: number) {
    return {
        token: 'access-1',
        user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test' },
        abilities: ['users:*'],
        renewal_token: 'renewal-1',
        access_token_expires_at: new Date(accessExpiresAt).toISOString(),
        renewal_token_expires_at: new Date(RENEWAL_EXPIRES_AT).toISOString(),
    }
}

/**
 * A renewal that moves the expiry forward each time.
 *
 * The first version returned a fixed expiry, so a second renewal rescheduled
 * itself to the same instant — which was in the past by then, and therefore due
 * again immediately. Advancing the clock by a day ran fifty renewals in a row and
 * never reached anything else. A real back end issues a *later* expiry every time,
 * and a stub that does not is testing a scenario that cannot occur.
 */
function renewed(nth: number, firstExpiresAt: number) {
    const expiresAt = firstExpiresAt + nth * FIFTEEN_MINUTES

    return {
        access_token: `access-${nth + 1}`,
        renewal_token: `renewal-${nth + 1}`,
        access_token_expires_at: new Date(expiresAt).toISOString(),
        renewal_token_expires_at: new Date(RENEWAL_EXPIRES_AT).toISOString(),
    }
}
