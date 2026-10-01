import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Resolves the application's `@/` path alias for the component tests.
 *
 * TypeScript reads it from `tsconfig.json` `paths`, and Vite does not read
 * `tsconfig.json` — so without this, a test that imports an application module
 * through `@/…`, or imports a page whose module does, fails to resolve at all.
 * The alias matches the tsconfig entry (`@/*` → `./*`); keeping the two in step
 * is the price of the alias, and it is paid here rather than by giving the tests
 * relative imports the application source does not use.
 *
 * **This file is identical in all four applications, and that is deliberate.**
 * It is test infrastructure, the same everywhere — the sibling of
 * `test/static-export.test.ts`, which is the other file per application that is
 * genuinely a copy. The repository-wide duplication test allows it by name; see
 * tests/Feature/FrontEndApplicationsTest.php.
 *
 * The environment stays node rather than jsdom: these tests render to a string
 * with `react-dom/server` and need no DOM.
 */
export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('.', import.meta.url)),
        },
    },
})
