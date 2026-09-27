import { describe, expect, it } from 'vitest'
import { LOCAL_API_URL, resolveBaseUrl } from '../lib/base-url'

/**
 * The address a static export is built against, and the two different mistakes
 * that can produce no address.
 *
 * Both failure directions are asserted, because either one on its own is a real
 * defect: a build that refuses to run without an argument breaks the documented
 * `npm run build`, and a build that always defaults produces an image pointing
 * at a developer's own machine.
 */
describe('resolving the back end address', () => {
    it('uses the local address when nothing was configured', () => {
        // A developer on a host. The documented workspace build has to work
        // without extra ceremony, and this is the address
        // config/applications.php already names for this application.
        expect(resolveBaseUrl(undefined)).toBe(LOCAL_API_URL)
    })

    it('uses a configured address exactly as given', () => {
        expect(resolveBaseUrl('https://api.fixmate.test')).toBe('https://api.fixmate.test')
        expect(resolveBaseUrl('http://10.0.0.4:8080')).toBe('http://10.0.0.4:8080')
    })

    it('refuses an address that was declared but left empty', () => {
        // What a Docker build invoked without --build-arg produces, because
        // the Dockerfile declares the ARG with no default. Baking the local
        // address in here would ship an image that starts, reports healthy and
        // points every user at localhost.
        expect(() => resolveBaseUrl('')).toThrow(/declared but given no value/)
    })

    it('does not treat a whitespace address as an address', () => {
        // `--build-arg NEXT_PUBLIC_API_URL=` with a stray space, which is an
        // easy typo and would otherwise produce a request to " ".
        expect(() => resolveBaseUrl(' ')).toThrow(Error)
    })
})
