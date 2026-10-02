'use client'

import { CustomerRegistration } from '@fixmate/session'
import { useRouter } from 'next/navigation'
import { operations } from '@/lib/application'

/**
 * The Customer Registration screen, at `/register/`.
 *
 * Delegation, with one exception that is not delegation: the sign-in link.
 *
 * **The screen cannot name a route, and neither can this.** A static export has
 * no route table to import, so the address is a string, and a string is exactly
 * the thing that rots when a page moves — a link to `/sign-in/` that 404s reads
 * as a broken build rather than as a stale path. So the address is written once
 * here, next to the other navigation in `lib/application.ts`'s `sections`, and
 * the page takes it from there rather than repeating it.
 *
 * That is also why this page is the only one of the three that touches the
 * router: the other two screens have nothing to navigate to, and this one has a
 * link the design puts on the screen. A page that grew a second one would want
 * the same treatment, and the test below is what stops that being forgotten.
 */
export default function RegisterPage() {
    const router = useRouter()

    return (
        <CustomerRegistration
            loadRegistration={(input) => operations.register(input)}
            onSignInInstead={() => router.push('/sign-in/')}
        />
    )
}