import { defineConfig } from 'vitest/config'

/**
 * Component tests need a DOM. jsdom rather than happy-dom because the
 * accessibility queries in @testing-library rely on the accessibility tree, and
 * a partial implementation answers "is this a link?" wrongly often enough that a
 * green suite would mean nothing.
 *
 * `globals` is not enabled: every file imports what it uses from `vitest`
 * explicitly, so a test cannot quietly depend on a global that a reader cannot
 * see.
 */
export default defineConfig({
    test: {
        environment: 'jsdom',
    },
})
