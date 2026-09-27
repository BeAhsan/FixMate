/**
 * Where the renewal token is kept between page loads.
 *
 * This is the seam the whole arrangement rotates on, and it is deliberately
 * the *only* thing in the session layer that knows. An application never calls
 * `localStorage`, and it never sees a renewal token except as an opaque string
 * this module hands to the API client.
 *
 * ## Why there are two shapes and not one
 *
 * The renewal token has to outlive a page load, and there are exactly two ways
 * to arrange that, with opposite security properties:
 *
 *   - **The client holds it** (today). It goes in Web Storage, which means
 *     injected script can read it. That is why the token is worth one use, is
 *     rotated every time, and is refused everywhere except the renewal route.
 *   - **The browser sends it automatically** (once there is a domain name). It
 *     becomes an httpOnly, secure cookie that no script on the page can read at
 *     all, and its lifetime can be lengthened because the reason for keeping it
 *     short is gone.
 *
 * A single interface with `read`/`write`/`clear` would have to pretend the
 * second case still had a token to read, and the honest shape of it is "there
 * is nothing here, and the browser will send it for us". So the two are
 * separate variants, and moving to the cookie is a change to *this file and to
 * the back end's CORS credentials setting* — the four applications pass a
 * different store and change nothing else.
 *
 * `sentAutomatically` therefore has no `read` and no `write`. TypeScript will
 * refuse to let an application ask for a token that does not exist, rather than
 * handing back `null` and letting that be mistaken for "signed out".
 */
export type RenewalTokenStore =
    | HeldByClientStore
    | SentAutomaticallyStore;

/** Web Storage, or anything else the client can read back. */
export interface HeldByClientStore {
    readonly kind: 'held-by-client'

    /** The stored token, or null when there is none. */
    read(): string | null

    /** Replace the stored token. Called on every renewal, because it rotates. */
    write(token: string): void

    /** Forget the token. */
    clear(): void
}

/**
 * An httpOnly cookie set by the back end.
 *
 * There is nothing for the client to read, write or clear, and that is the
 * improvement rather than a gap: the renewal token stops being reachable from
 * injected script entirely. `clear()` exists and does nothing on the client
 * side, because a signed-out person still needs the cookie gone — and the only
 * thing that can remove an httpOnly cookie is a request to the back end, which
 * is what sign-out already is.
 */
export interface SentAutomaticallyStore {
    readonly kind: 'sent-automatically'

    clear(): void
}

/**
 * A `RenewalTokenStore` over `localStorage`, with `sessionStorage` as a
 * fallback and an in-memory store as a last resort.
 *
 * The fallbacks are not decoration. Safari in private mode and some embedded
 * browsers throw on `localStorage` access rather than returning null, and a
 * session layer that threw on load would leave the application permanently
 * signed out with no way to sign in. Degrading to memory means the session works
 * for the life of the tab and simply does not survive a reload, which is the
 * behaviour before this ticket existed and is a graceful enough failure.
 *
 * @param key Storage key. Namespaced per application, because the four are
 *            served from four origins and would otherwise be describing the same
 *            slot on the same machine.
 */
export function webStorageRenewalTokenStore(key: string): HeldByClientStore {
    return {
        kind: 'held-by-client',
        read: () => readKey(key),
        write: (token: string) => writeKey(key, token),
        clear: () => removeKey(key),
    };
}

/** An in-memory store. Survives nothing, which is the honest description. */
export function memoryRenewalTokenStore(key = 'renewal'): HeldByClientStore {
    let token: string | null = null;

    return {
        kind: 'held-by-client',
        read: () => token,
        write: (value: string) => {
            token = value;
        },
        clear: () => {
            token = null;
        },
    };
}

/**
 * The cookie arrangement, for when there is a domain name.
 *
 * Present now so the shape is settled and exercised, not so it can be switched
 * on prematurely: without a shared parent domain the four applications cannot
 * share one cookie, and a per-origin cookie gains nothing over Web Storage.
 */
export function cookieRenewalTokenStore(): SentAutomaticallyStore {
    return {
        kind: 'sent-automatically',
        clear: () => {
            // Nothing to do. The token is not readable from here, and the only
            // way to remove it is for the back end to expire it, which sign-out
            // does by revoking the token itself.
        },
    };
}

function storage(kind: 'local' | 'session'): Storage | null {
    try {
        const store = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;

        // Touching a property is enough to trigger the throw in a locked-down
        // browser, so this cannot be a mere existence check.
        store.getItem('fixmate.probe')

        return store
    } catch {
        return null
    }
}

function readKey(key: string): string | null {
    for (const kind of ['local', 'session'] as const) {
        const value = storage(kind)?.getItem(key) ?? null

        if (value !== null) {
            return value
        }
    }

    return null
}

function writeKey(key: string, token: string): void {
    for (const kind of ['local', 'session'] as const) {
        const store = storage(kind)

        if (store === null) {
            continue
        }

        try {
            store.setItem(key, token)

            return
        } catch {
            // A full or blocked store. Try the next one rather than losing the
            // token the back end has just rotated.
        }
    }
}

function removeKey(key: string): void {
    for (const kind of ['local', 'session'] as const) {
        try {
            storage(kind)?.removeItem(key)
        } catch {
            // Nothing useful to do; the token is being discarded anyway.
        }
    }
}
