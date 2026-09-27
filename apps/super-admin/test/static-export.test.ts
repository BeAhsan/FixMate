import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the one property this application is built around: that it is a static
 * export, with no application server behind it.
 *
 * The build itself is the real check - `output: 'export'` fails the build for
 * any route that needs a request. But the build only runs in the image and in
 * the root `npm run build`, so a dynamic route added on a branch would sit
 * unnoticed until an image failed to build. This runs in `npm test`, which is in
 * both the pull-request gate and the delivery pipeline, and turns that class of
 * mistake into a test failure instead of a failed deployment.
 *
 * It reads the source rather than a build artefact on purpose: it has to work
 * on a clean checkout with nothing built.
 *
 * **This file is identical in all four applications, and that is deliberate.**
 * It tests a property of the packaging, which is the same everywhere. It is the
 * one file per application that is genuinely a copy, and the repository-wide
 * duplication test allows it by name - see tests/Feature/FrontEndApplicationsTest.php.
 */

const APP_DIRECTORY = new URL('../app/', import.meta.url).pathname

/**
 * Source constructs that make a route impossible to export statically.
 *
 * A dynamic segment is a route whose path is only known per request - Next.js
 * cannot know what to write to `out/`, and either refuses to export or emits a
 * client-side-only shell that the nginx config's `=404` fallback will not
 * resolve. The `next/headers` functions read the incoming request, which does
 * not exist at build time.
 */
const SERVER_ONLY_CONSTRUCTS: ReadonlyArray<{ pattern: RegExp; because: string }> = [
    {
        pattern: /\b(cookies|headers|draftMode)\s*\(/,
        because: 'reads the incoming request, and a build has none',
    },
    {
        pattern: /export\s+const\s+(dynamic|revalidate|fetchCache)\s*=/,
        because: 'opts a route out of being rendered at build time',
    },
    {
        pattern: /\b(unstable_noStore|noStore)\s*\(/,
        because: 'opts a route out of being rendered at build time',
    },
]

function entriesIn(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry)

        return statSync(path).isDirectory() ? [path, ...entriesIn(path)] : [path]
    })
}

function sourceFilesIn(directory: string): string[] {
    return entriesIn(directory).filter((path) => /\.(ts|tsx|js|jsx)$/.test(path))
}

const sourceFiles = sourceFilesIn(APP_DIRECTORY)

describe('the static export contract', () => {
    it('has routes to export', () => {
        // Without this, every assertion below would pass on an empty directory,
        // which is the shape a mis-pointed APP_DIRECTORY takes.
        expect(sourceFiles.length).toBeGreaterThan(0)
    })

    it('has no dynamic route segments', () => {
        // Every directory under app/, not just the ones at its top level. A route
        // is as likely to be `app/bookings/[id]` as `app/[id]`, and a check that
        // only read the top level passed with the nested one in place - which is
        // the whole reason this is demonstrated rather than assumed.
        const dynamicSegments = entriesIn(APP_DIRECTORY)
            .filter((path) => {
                const name = path.slice(path.lastIndexOf('/') + 1)

                return name.startsWith('[') && name.endsWith(']')
            })
            .map((path) => path.slice(APP_DIRECTORY.length))

        expect(
            dynamicSegments,
            'A dynamic segment cannot be exported to a static directory. If this route needs to exist, give it a path the export can write.',
        ).toEqual([])
    })

    it('reads nothing from the request at build time', () => {
        const offences = sourceFiles.flatMap((file) => {
            const contents = readFileSync(file, 'utf8')

            return SERVER_ONLY_CONSTRUCTS.filter(({ pattern }) => pattern.test(contents)).map(
                ({ because }) => `${file.slice(APP_DIRECTORY.length)}: ${because}`,
            )
        })

        expect(offences, 'This application is served as files, so nothing may depend on a request.').toEqual([])
    })
})
