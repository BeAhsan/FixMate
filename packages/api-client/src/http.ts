import { ApiError, normaliseContractFailure, normaliseErrorResponse, normaliseTransportFailure } from './errors'
import { SchemaError, type Schema } from './schema'

/**
 * The fetch wrapper. This is the single place that knows how to talk to the back
 * end: the base address, the `Authorization` header, the JSON content type, the
 * shape every response is checked against, and the error type every failure
 * arrives as.
 *
 * Applications call operations (see operations.ts) and never `fetch` directly.
 * The one thing deliberately not here is a retry policy: what is worth retrying
 * differs per operation, and guessing in this layer would make a sign-in
 * silently repeat itself.
 */

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

/**
 * The part of a generated wayfinder function this package consumes. Typed
 * structurally rather than importing the generated type, so the wrapper is
 * readable on its own and so a change in wayfinder's emitted type surfaces here
 * rather than silently widening.
 */
export interface Route {
    readonly url: string
    readonly method: HttpMethod
}

export type QueryValue = string | number | boolean | null | undefined

export type Query = Record<string, QueryValue>

export interface ApiClientOptions {
    /** The back end's address, e.g. `https://api.fixmate.test`. Supplied at build time. */
    baseUrl: string
    /**
     * Returns the current access token, or null when signed out. Called per
     * request, because a token is renewed while the application is running.
     */
    getAccessToken?: () => string | null | undefined
    /** Injectable so the package can be tested without a network. */
    fetch?: typeof globalThis.fetch
    /** Sent with every request, e.g. the application identity. */
    headers?: Record<string, string>
}

export interface RequestOptions<TBody, TResponse> {
    /** The shape the response is checked against before it is returned. */
    response: Schema<TResponse>
    body?: TBody
    query?: Query
    headers?: Record<string, string>
    signal?: AbortSignal
}

export interface ApiClient {
    request<TBody, TResponse>(route: Route, options: RequestOptions<TBody, TResponse>): Promise<TResponse>
    /** The absolute URL a route resolves to, for a link or a form action. */
    url(route: Route, query?: Query): string
}

const JSON_HEADERS: Readonly<Record<string, string>> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
}

/**
 * Build a query string, skipping null and undefined so an application can pass a
 * field straight from a form without filtering it first.
 */
export function buildQuery(query: Query = {}): string {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined) {
            continue;
        }

        search.append(key, String(value));
    }

    const encoded = search.toString();

    return encoded === '' ? '' : `?${encoded}`;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
    const baseUrl = options.baseUrl.replace(/\/+$/, '')
    const doFetch = options.fetch ?? globalThis.fetch

    if (typeof doFetch !== 'function') {
        throw new TypeError('No fetch implementation is available; pass one to createApiClient.')
    }

    const url = (route: Route, query?: Query): string => `${baseUrl}${route.url}${buildQuery(query)}`

    const headersFor = (extra: Record<string, string> = {}): Record<string, string> => {
        const headers: Record<string, string> = { ...JSON_HEADERS, ...options.headers, ...extra }
        const token = options.getAccessToken?.()

        // Attached here, in the one place that talks to the back end, rather
        // than by each of the four applications on each of their calls.
        if (typeof token === 'string' && token !== '' && !('Authorization' in headers)) {
            headers['Authorization'] = `Bearer ${token}`
        }

        return headers
    }

    const request = async <TBody, TResponse>(
        route: Route,
        requestOptions: RequestOptions<TBody, TResponse>,
    ): Promise<TResponse> => {
        const method = route.method.toUpperCase()
        const hasBody = requestOptions.body !== undefined

        let response: Response

        try {
            response = await doFetch(url(route, requestOptions.query), {
                method,
                headers: headersFor(requestOptions.headers),
                ...(hasBody ? { body: JSON.stringify(requestOptions.body) } : {}),
                ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
                // The back end authenticates with a bearer token, not a cookie,
                // so credentials are never sent and a cross-origin request cannot
                // be upgraded by an ambient cookie.
                credentials: 'omit',
            })
        } catch (cause) {
            throw normaliseTransportFailure(cause)
        }

        const payload = await readJson(response)

        if (!response.ok) {
            throw normaliseErrorResponse(response.status, payload)
        }

        try {
            return requestOptions.response.parse(payload)
        } catch (cause) {
            if (cause instanceof SchemaError) {
                throw normaliseContractFailure(cause.path, requestOptions.response.label, cause)
            }

            throw cause
        }
    }

    return { request, url }
}

/**
 * Read a response body as JSON, tolerating an empty one.
 *
 * A 204 has no body, and an nginx error page on a 502 is HTML. Neither should
 * turn into a JSON parse error that hides the status that actually mattered.
 */
async function readJson(response: Response): Promise<unknown> {
    const text = await response.text().catch(() => '')

    if (text === '') {
        return null
    }

    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

export { ApiError }
