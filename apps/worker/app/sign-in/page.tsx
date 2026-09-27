'use client'

import { SignInScreen } from '@/lib/application'
import { Suspense } from 'react'

/**
 * The sign-in screen, at its own address.
 *
 * A whole address rather than a dialog over the dashboard, and the reason is user
 * story 27: on a shared device a dialog leaves the previous person's dashboard
 * rendered underneath it while the next person types a password.
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
 * The `Suspense` boundary is required rather than decorative: `SignInScreen`
 * reads the query string for `?next=`, and during a static export there is no
 * query string to read while the page is being prerendered.
 */
export default function SignInPage() {
    return (
        <Suspense fallback={<main className="min-h-screen" />}>
            <SignInScreen />
        </Suspense>
    )
}
