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
 * `@fixmate/session` turns that into the five operations this door may call. An
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
/**
 * The navigation this door offers.
 *
 * Two entries, and one of them is one an administrator can never be shown.
 *
 * `/bookings/`, `/workers/`, `/customers/` and `/reports/` were all here and
 * all four pointed at routes that have never existed — `apps/admin` has exactly
 * one page, the dashboard. Nothing failed when they were removed: the shell
 * renders whatever it is handed, so a navigation entry is not checked for a
 * screen behind it by anything that builds.
 *
 * The four are recorded in `routes_not_yet_built` in `config/applications.php`
 * rather than left here, so the intent survives its absence without a link that
 * 404s standing in for it.
 *
 * `/accounts/` is gated behind `accounts:read`, which an administrator does
 * not hold — their token carries `admins:*`, and `AccountType::abilities()` says
 * in its own comment that the `accounts:*` family is what an administrator is
 * *not* given. So this entry is filtered out and never rendered. That is stated
 * as a fact rather than left to be discovered: it is the one place in the
 * repository where an entry names an ability its own account type is designed
 * not to have, and a reader would reasonably take that for a mistake.
 *
 * Whether an administrator *should* be able to list accounts is a product
 * question, and it is answered in `AccountType::abilities()` if it is answered
 * anywhere — not here, by changing the ability a screen asks for. If it is
 * answered there, this entry starts rendering, and there is still no page for
 * it; that is then a gap, and this test is what reports it.
 *
 * `FrontEndNavigationResolvesTest` fails if an entry is added back without a
 * page, and fails if a page is built without the entry being restored.
 */
const sections = [
    { href: '/', label: 'Dashboard' },
    { href: '/accounts/', label: 'All accounts', requiredAbility: 'accounts:read' },
]

export const {
    session,
    SessionProvider,
    ApplicationShell,
    SignInScreen,
    ChangePasswordScreen,
} = createApplication({
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
