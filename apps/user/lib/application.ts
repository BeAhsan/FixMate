import { resolveApiBaseUrl } from '@fixmate/api-client'
import { createApplication } from '@fixmate/session'

/**
 * The end user application.
 *
 * **This file is the whole application.** Everything below is configuration: the
 * key that says which account type this is, the address, the navigation, and
 * three pieces of copy. There is no sign-in flow here, no shell, no session
 * handling and no fetch call — those are `@fixmate/session` and `@fixmate/ui`,
 * and the other three applications import exactly the same ones.
 *
 * That is the property the whole monorepo is arranged around. A repository-wide
 * test asserts that no application contains a copy of the sign-in flow or the
 * shell, and that no application names an account type's operations — so this
 * file being twenty lines is enforced, not merely intended.
 *
 * The account type is not named here at all. It is implied by
 * `application: 'user'`, and `OPERATIONS_BY_APPLICATION` in `@fixmate/session`
 * turns that into the five operations this door may call. An application cannot
 * reach a worker's door because it has no way to say so; the only thing that
 * could stop it is the back end's `account.can`.
 */

/**
 * The navigation, with the ability each section needs.
 *
 * "All accounts" is here deliberately and is genuinely hidden for this account
 * type, which carries `users:*` and nothing else. It is in the list to prove the
 * filter runs on this application too, rather than passing because the list
 * happened to contain nothing restricted.
 */
const sections = [
    { href: '/', label: 'Dashboard' },
    { href: '/bookings/', label: 'Bookings' },
    { href: '/account/', label: 'Account' },
    { href: '/accounts/', label: 'All accounts', requiredAbility: 'accounts:read' },
]

export const {
    session,
    SessionProvider,
    ApplicationShell,
    SignInScreen,
    ChangePasswordScreen,
} = createApplication({
    application: 'user',
    applicationLabel: 'FixMate',
    // Inlined into the bundle at build time, because a static export has nothing
    // to read an environment variable at run time. The Dockerfile takes it as a
    // build argument with no default, so omitting it fails the build rather than
    // shipping an image pointing at localhost.
    baseUrl: resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL),
    sections,
    subject: 'end user',
})
