import { resolveApiBaseUrl } from '@fixmate/api-client'
import { createApplication } from '@fixmate/session'

/**
 * The administrator application.
 *
 * **This file is the whole application.** Everything below is configuration: the
 * key that says which account type this is, the address, the navigation, and
 * three pieces of copy. There is no sign-in flow here, no shell, no session
 * handling and no fetch call — those are `@fixmate/session` and `@fixmate/ui`,
 * and the other three applications import exactly the same ones.
 *
 * That is the property the monorepo is arranged around, and a repository-wide
 * test enforces it: no application may contain a copy of the sign-in flow or the
 * shell, and no application may name another account type's operations.
 *
 * The account type is not named here at all. It is implied by
 * `application: 'admin'`, and `OPERATIONS_BY_APPLICATION` in
 * `@fixmate/session` turns that into the four operations this door may call. An
 * application cannot reach a customer's door because it has no way to say so;
 * the only thing that could stop it is the back end's `account.can`.
 *
 * Copy `apps/user` to add a fifth: the Dockerfile, the manifests and this file.
 * Nothing else in an application is worth copying.
 */

/**
 *
 * The navigation, with the ability each section needs.
 *
 * A section whose ability the live token does not carry is not rendered. The back end
 * refuses it either way; this is the courtesy, and the two are not the same thing.
 */
const sections = [
    { href: '/', label: 'Dashboard' },
    { href: '/bookings/', label: 'Bookings' },
    { href: '/workers/', label: 'Workers' },
    { href: '/customers/', label: 'Customers' },
    { href: '/reports/', label: 'Reports' },
    { href: '/accounts/', label: 'All accounts', requiredAbility: 'accounts:read' },
]

export const { session, SessionProvider, ApplicationShell, SignInScreen } = createApplication({
    application: 'admin',
    applicationLabel: 'FixMate Admin',
    // Inlined into the bundle at build time, because a static export has nothing
    // to read an environment variable at run time. The Dockerfile takes it as a
    // build argument with no default, so omitting it fails the build rather than
    // shipping an image pointing at localhost.
    baseUrl: resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL),
    sections,
    subject: 'administrator',
})
