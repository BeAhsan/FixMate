/**
 * The one place the access token lives.
 *
 * An object rather than a variable inside the session, because two things need
 * to read the token and one of them is constructed *before* the session is: the
 * API client is handed a getter at creation, and the session does not exist yet
 * at that point.
 *
 * The obvious alternatives are both worse. Passing `() => session.accessToken()`
 * means the application holds a `let session` that is undefined until an
 * assignment two lines later — a closure over a variable that is not ready, which
 * type-checks only with an assertion and fails at run time if the order ever
 * changes. Having the session push the token into the client instead needs the
 * client to expose a setter, which spreads token state across two objects.
 *
 * One holder, created first, read by the client and written by the session:
 *
 * ```ts
 * const tokens = createAccessTokenSource()
 * const client = createApiClient({ baseUrl, getAccessToken: tokens.get })
 * const session = createSession({ tokens, operations, store })
 * ```
 *
 * There is no method here that returns the token to anything else, no `toJSON`,
 * and no way to observe it. That is the point — a value that cannot be read
 * cannot be logged, serialised into a React prop, or written to storage by
 * something that decides to be helpful.
 *
 * ## It also holds the renewal token, briefly
 *
 * `presentAs` exists because a renewal call needs a bearer credential and there
 * is no access token to present at that moment — the whole reason for renewing
 * is that the previous one has expired or is about to. So the holder carries
 * *the credential the next request should present*, which is the access token
 * almost always and the renewal token for the duration of one renewal call.
 *
 * It is restored in a `finally`, so a renewal that throws cannot leave the
 * renewal token installed as the bearer credential. And if some concurrent
 * request did go out while it was installed, the back end refuses it: a renewal
 * token is barred from every route except the renewal one, so the failure mode
 * is a 403 rather than a silently under-privileged request.
 */
export interface AccessTokenSource {
    /** The credential the next request should present, or null. */
    get(): string | null
    /**
     * Replace it. `null` forgets it.
     *
     * Named `set` rather than exposed as a general setter for symmetry with
     * `get`, but it is only ever called by the session layer.
     */
    set(token: string | null): void
    /**
     * Run `call` with `credential` presented instead, then put back whatever was
     * there before.
     *
     * This is the only correct way to send the renewal token, and it is
     * deliberately a scope rather than a setter: a session that set the
     * credential and forgot to restore it would present a browser-stored token
     * to every subsequent request, which is precisely the mistake this whole
     * arrangement exists to prevent.
     */
    presentAs<T>(credential: string, call: () => Promise<T>): Promise<T>
}

export function createAccessTokenSource(initial: string | null = null): AccessTokenSource {
    let token = initial

    return {
        get: () => token,
        set: (value: string | null) => {
            token = value
        },
        presentAs: async <T>(credential: string, call: () => Promise<T>): Promise<T> => {
            const previous = token
            token = credential

            try {
                return await call()
            } finally {
                token = previous
            }
        },
    }
}
