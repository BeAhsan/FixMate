/**
 * Decide the back end's address from what the build environment provided.
 *
 * Split out of `lib/api.ts` as a pure function so it can be tested, because
 * this is the one piece of arithmetic standing between a production image and
 * `localhost`, and the failure it prevents is invisible until a browser cannot
 * sign in.
 *
 * `configured` is `process.env.NEXT_PUBLIC_API_URL`, passed in so this function
 * has no opinion about where the value came from.
 * - `undefined` — nothing was set. A developer building on a host, where the
 *   local address is the right answer.
 * - blank — something declared the variable and gave it nothing useful, which in
 *   this repository means a Docker build invoked without `--build-arg`, or with
 *   a stray space after the `=`. That throws.
 * - anything else — used as given.
 *
 * An empty string is a *different mistake* from an absent variable, and
 * collapsing the two is the bug this shape exists to prevent: default on both
 * and a production image ships pointing at a developer's machine; throw on both
 * and the documented `npm run build` stops working.
 */
export const LOCAL_API_URL = 'http://localhost:8000'

export function resolveBaseUrl(configured: string | undefined): string {
    if (configured !== undefined && configured.trim() === '') {
        throw new Error(
            'NEXT_PUBLIC_API_URL was declared but given no value. This image would be built pointing at localhost. Pass it explicitly: docker build --build-arg NEXT_PUBLIC_API_URL=https://... -f apps/user/Dockerfile .',
        )
    }

    return configured ?? LOCAL_API_URL
}
