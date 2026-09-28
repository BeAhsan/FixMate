'use client'

import { ChangePasswordScreen } from '@/lib/application'
import { Suspense } from 'react'

/**
 * The change-password screen, at its own address.
 *
 * A separate address for the same reason sign-in is one: a person on a shared
 * device who is sent here must not find a previous session's dashboard rendered
 * behind the form. A modal over a dashboard is exactly that.
 *
 * This file is **delegation and nothing else**, in all four applications, and
 * that is why it appears on the allowed-identical list in
 * `tests/Feature/FrontEndApplicationsTest.php`. The whole of the flow is in
 * `@fixmate/session`; a `<form>`, a `fetch` or a `router.push` appearing here
 * would mean it had been copied, and that test fails.
 *
 * It is a client component because `lib/application` calls `createApplication()`
 * at module scope, and Next.js will not let a server render call a client
 * function. See `app/providers.tsx` for the same constraint one level up.
 *
 * The `Suspense` boundary is **required, and the build proves it** — the first
 * version of this file carried a comment arguing that this screen could do
 * without one, on the grounds that reading `?next=` only decides where the person
 * goes afterwards rather than whether the page can render. `next build` refused
 * with "useSearchParams() should be wrapped in a suspense boundary at page
 * /change-password", which is Next.js declining the argument: the hook is a
 * client-side bail-out, and a static export has no query string to bail out of.
 *
 * The fallback is an empty `<main>` with the screen's own height, so the
 * prerendered HTML occupies the page rather than collapsing to nothing. What
 * ships in `out/change-password.html` is therefore that empty main, and the
 * screen renders in the browser — exactly as the sign-in page behaves, and the
 * reason `grep`ping the export for a heading proves nothing for either. The
 * screen is verified by its component test instead.
 */
export default function ChangePasswordPage() {
    return (
        <Suspense fallback={<main className="min-h-screen" />}>
            <ChangePasswordScreen />
        </Suspense>
    )
}
