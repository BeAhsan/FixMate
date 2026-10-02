'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * What a screen fetching one of the mocked customer endpoints is looking at.
 *
 * A discriminated union rather than three pieces of state, because the three
 * states are not independent and the bug worth preventing is a screen that shows
 * a spinner *and* a failure, or stale data *and* a spinner. One value makes
 * "which of these is true" unanswerable to get wrong: `status` is the single
 * thing a render branches on.
 *
 * `refreshing` is separate from `status` because polling a tracking endpoint is
 * not a second state — it is the same data being fetched again — and folding it
 * into `status` would blank the technician's position on every tick.
 */
export type MockedResource<T> =
    | { status: 'loading'; data: null; refreshing: boolean }
    | { status: 'failed'; data: null; message: string; refreshing: boolean }
    | { status: 'ready'; data: T; refreshing: boolean }

/**
 * Fetch one of the mocked customer endpoints on mount, and expose a reload.
 *
 * ## Why this exists rather than `useEffect` in each screen
 *
 * Three screens need the same four things and each of them is easy to get wrong:
 *
 * - **A cancelled request must not set state.** Without the `cancelled` flag, a
 *   person who navigates away while a request is in flight gets a state update
 *   on an unmounted component, and in a static export that is a console error
 *   rather than a crash — the kind that is easy to dismiss and hides the next
 *   one.
 * - **A failure must be a failure, not an empty screen.** The union above forces
 *   the render to decide, which is the whole reason an empty `data` is not
 *   reachable.
 * - **The loader must not be recreated on every render.** Passing an inline
 *   arrow straight to `useEffect` re-fetches forever, because the effect's
 *   dependency changes on the render the fetch itself caused. `load` is therefore
 *   held in a ref and the effect depends on the caller's key alone.
 *
 * `load` returning a promise is all this knows about the back end. It has no
 * idea whether the operation is mocked, and nothing here changes if the real
 * estimator replaces the diagnosis literal tomorrow — which is the point of
 * writing the screens against a shape rather than against a fixture.
 */
export function useMockedResource<T>(load: () => Promise<T>, key: string): MockedResource<T> & {
    reload: () => void
} {
    const [resource, setResource] = useState<MockedResource<T>>({
        status: 'loading',
        data: null,
        refreshing: false,
    })

    // The loader in a ref, so the effect below depends on `key` alone. A caller
    // writing `useMockedResource(() => operations.tracking(), 'tracking')` gets
    // a new arrow function on every render, and an effect depending on that
    // arrow fetches on every render — including the ones its own fetch caused.
    const loader = useRef(load)
    loader.current = load

    const reload = useCallback(() => {
        let cancelled = false

        setResource((previous) => ({ ...previous, refreshing: true }))

        loader
            .current()
            .then((data) => {
                if (!cancelled) {
                    setResource({ status: 'ready', data, refreshing: false })
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setResource({
                        status: 'failed',
                        data: null,
                        refreshing: false,
                        message: describeResourceFailure(error),
                    })
                }
            })

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(reload, [reload, key])

    return { ...resource, reload }
}

/**
 * Turn a failure into a sentence a person can act on.
 *
 * The three cases worth naming are the same three `describeSignInFailure`
 * distinguishes, for the same reasons — and the most important one is that **the
 * back end's own message is passed through untouched when it sent one.** A
 * `403` on a customer screen has a specific cause and the front end does not
 * know which, so anything written here is a guess that can be wrong in a way the
 * person cannot check.
 *
 * `network` and `contract` are rewritten because the back end said nothing at
 * all: the first means no answer arrived, and the second means an answer arrived
 * that no longer fits. Telling somebody to retry in the second case would be
 * exactly wrong — the service is up, and retrying returns the same shape.
 */
export function describeResourceFailure(error: unknown): string {
    if (!isApiErrorLike(error)) {
        return 'Something went wrong loading this screen. Please try again.'
    }

    switch (error.kind) {
        case 'network':
            return 'Could not reach the FixMate service. Check your connection and try again.'

        case 'contract':
            return 'The service replied in a shape this screen does not recognise, so it could not be shown.'

        default:
            return error.message
    }
}

/**
 * The shape this module needs from an error, checked structurally.
 *
 * `instanceof ApiError` would need the class imported as a *value*, and this
 * package is also imported by applications that import the client themselves —
 * under a bundler that can produce two copies of the module, which would make
 * every check here silently false and every failure report the generic sentence.
 */
function isApiErrorLike(error: unknown): error is { kind: string; message: string } {
    return (
        typeof error === 'object' &&
        error !== null &&
        'kind' in error &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string'
    )
}