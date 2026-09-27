/**
 * Decide the back end's address from what the build environment provided.
 *
 * Lives here rather than in each application because all four build the same way
 * and this is the one piece of arithmetic standing between a production image and
 * `localhost` — a failure that is invisible until a browser cannot sign in.
 *
 * `configured` is `process.env.NEXT_PUBLIC_API_URL`, passed in so this function
 * has no opinion about where the value came from and can be tested.
 *
 * - `undefined` — nothing was set. A developer building on a host, where the
 *   local address is the right answer and the documented `npm run build` has to
 *   keep working.
 * - blank — something declared the variable and gave it nothing useful, which in
 *   this repository means a Docker build invoked without `--build-arg`, or with a
 *   stray space after the `=`. That throws.
 * - anything else — used as given.
 *
 * An empty string is a *different mistake* from an absent variable, and
 * collapsing the two is the bug this shape exists to prevent: default on both and
 * a production image ships pointing at a developer's machine; throw on both and
 * the documented `npm run build` stops working.
 */
export const LOCAL_API_URL = 'http://localhost:8000'

export function resolveApiBaseUrl(configured: string | undefined): string {
    if (configured !== undefined && configured.trim() === '') {
        throw new Error(
            'NEXT_PUBLIC_API_URL was declared but given no value. This image would be built pointing at localhost. Pass it explicitly: docker build --build-arg NEXT_PUBLIC_API_URL=https://... -f apps/<name>/Dockerfile .',
        )
    }

    return configured ?? LOCAL_API_URL
}
