/**
 * The access token, in memory.
 *
 * A static export has no server-side session and no way to set an httpOnly
 * cookie from application code, so there is nowhere to keep a token that
 * injected script cannot read. It is held in a module variable and nowhere
 * else: never `localStorage`, never `sessionStorage`, never a cookie.
 *
 * The cost of that choice is that the token does not survive a page reload, so
 * something has to put it back. That is the renewal token, and it is what this
 * module grows next — see ticket 16. Until then the honest behaviour is that a
 * reload signs the person out, which is worse for them and better for the token
 * than the alternative.
 *
 * A module variable rather than React state on purpose: the API client reads
 * the token per request, from outside the tree, and a token that lived in a
 * component would have to be threaded into every call or kept in a context that
 * the client still could not see.
 */

let accessToken: string | null = null

/** The current access token, or null when signed out. */
export function getAccessToken(): string | null {
    return accessToken
}

/**
 * Hold a token for the rest of this page's life.
 *
 * Returns the function that forgets it, so a caller cannot accidentally keep
 * using a closure over a token it believes it has discarded.
 */
export function setAccessToken(token: string): () => void {
    accessToken = token

    return () => {
        accessToken = null
    }
}

/** Forget the token. */
export function clearAccessToken(): void {
    accessToken = null
}
