import { createApiClient, createOperations } from '@fixmate/api-client'
import { resolveBaseUrl } from './base-url'
import { getAccessToken } from './session'

/**
 * The one place in this application that knows the back end exists.
 *
 * Every request goes through here, and no component calls `fetch`. That is what
 * makes the generated client worth having: the URL for a sign-in is whatever
 * `laravel/wayfinder` read out of `routes/api.php`, so a renamed route fails
 * the build instead of failing in a browser.
 *
 * ## The back end's address, and why unset and empty are not the same
 *
 * `NEXT_PUBLIC_API_URL` is inlined at build time, which is the constraint a
 * static export imposes: there is nothing to read an environment variable at run
 * time, so an image is built for one back end.
 *
 * That leaves two ways for it to be absent, and they must not be treated alike:
 *
 *   - **absent**, which is a developer running `npm run build` on a host. The
 *     local address is the right answer and is already the one
 *     `config/applications.php` names for this application, so it is used
 *     rather than making the documented workspace build fail.
 *
 *   - **present but empty**, which is a Docker build stage that declared the
 *     variable and was given no value. The `Dockerfile` declares the build
 *     argument with no default precisely so that omitting `--build-arg` arrives
 *     here as an empty string rather than as nothing at all, and this throws
 *     instead of quietly baking the local address into an image that would then
 *     point every deployment at a developer's own machine.
 *
 * The distinction is the whole trick, and it is `resolveBaseUrl` rather than an
 * `if` here so that it can be tested. Failing on both would make `npm run build`
 * unusable; defaulting on both would let a production image be built with
 * `localhost` in it and nobody would find out until a browser silently could
 * not sign in.
 */
const baseUrl = resolveBaseUrl(process.env.NEXT_PUBLIC_API_URL)

export const client = createApiClient({
    baseUrl,
    // Read per request rather than captured once, because a token is put back
    // after a sign-in and this module is created before there is one.
    getAccessToken,
})

export const operations = createOperations(client)

export { ApiError } from '@fixmate/api-client'
export type { ApiErrorKind } from '@fixmate/api-client'
